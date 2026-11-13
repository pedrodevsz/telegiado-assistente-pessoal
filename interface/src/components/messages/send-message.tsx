"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mic, MicOff, Play, RotateCcw, Square, X } from "lucide-react";
import { generateSpeech, MAX_SPEECH_TEXT_LENGTH } from "@/services/generate-speech";
import { MAX_MESSAGES, MAX_MESSAGE_LENGTH, MAX_TOTAL_LENGTH, sendMessage, type ChatMessage } from "@/services/send-message";
import { transcribeAudio } from "@/services/transcribe-audio";

type ConversationMessage = ChatMessage & { id: string };
type VoiceStatus = "generating" | "ready" | "playing" | "generation-error";
type VoiceState = { status: VoiceStatus; url?: string; notice?: string; truncated?: boolean };
type RecordingState = "idle" | "requesting-permission" | "recording" | "transcribing";
type VoiceActivityState = "waiting" | "speaking" | "silence";
type RecordingStopReason = "manual" | "silence" | "maximum";

const MAX_RECORDING_DURATION_MS = 60_000;
const MAX_RECORDING_SIZE = 24 * 1024 * 1024;
const SILENCE_TIMEOUT_MS = 8_000;
const VOICE_ACTIVITY_SAMPLE_MS = 100;
const SPEECH_RMS_THRESHOLD = 0.035;
const SPEECH_PEAK_THRESHOLD = 0.09;
const SPEECH_CONFIRMATION_SAMPLES = 3;
const RECORDING_FORMATS = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "mp4" },
    { mimeType: "audio/mp4", extension: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
] as const;

const BAR_COUNT = 40;
const QUIET_LEVELS = Array.from({ length: BAR_COUNT }, (_, index) => 0.12 + (index % 5) * 0.012);
const BAR_HUES = Array.from({ length: BAR_COUNT }, (_, index) => {
    const distanceFromCenter = Math.abs(index - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
    return 220 + distanceFromCenter * 55;
});

function totalContentLength(messages: ChatMessage[]) {
    return messages.reduce((total, current) => total + current.content.length, 0);
}

function prepareHistory(messages: ConversationMessage[], userMessage: ConversationMessage) {
    let requestMessages = [...messages, userMessage];
    while (
        requestMessages.length > 1 &&
        (requestMessages.length > MAX_MESSAGES ||
            totalContentLength(requestMessages) > MAX_TOTAL_LENGTH ||
            requestMessages.some((current) => current.content.length > MAX_MESSAGE_LENGTH))
    ) {
        requestMessages = requestMessages.slice(2);
    }
    return requestMessages;
}

export function SendMessage() {
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [voices, setVoices] = useState<Record<string, VoiceState>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [recordingState, setRecordingState] = useState<RecordingState>("idle");
    const [recordingError, setRecordingError] = useState("");
    const [voiceActivityState, setVoiceActivityState] = useState<VoiceActivityState>("waiting");
    const nextMessageIdRef = useRef(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const activeAudioIdRef = useRef<string | null>(null);
    const speechRequestRef = useRef<{ messageId: string; controller: AbortController } | null>(null);
    const audioUrlsRef = useRef(new Set<string>());
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const recordingExtensionRef = useRef("webm");
    const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const voiceActivityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordingAudioContextRef = useRef<AudioContext | null>(null);
    const recordingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
    const speechDetectedRef = useRef(false);
    const consecutiveSpeechSamplesRef = useRef(0);
    const shouldSubmitRecordingRef = useRef(false);
    const recordingFinalizedRef = useRef(false);
    const recordingStopReasonRef = useRef<RecordingStopReason>("manual");
    const recordingSessionRef = useRef(0);
    const transcriptionControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);

    const latestAssistant = [...messages].reverse().find((current) => current.role === "assistant");
    const latestVoice = latestAssistant ? voices[latestAssistant.id] : undefined;

    function nextMessageId() {
        nextMessageIdRef.current += 1;
        return `message-${nextMessageIdRef.current}`;
    }

    function resetVisualizer() {
        if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        barsRef.current.forEach((bar, index) => {
            if (!bar) return;
            bar.style.transform = `scaleY(${QUIET_LEVELS[index]})`;
            bar.style.opacity = "";
            bar.style.boxShadow = `0 0 5px hsla(${BAR_HUES[index]} 95% 65% / 0.24)`;
        });
    }

    function ensureAudioGraph() {
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        if (audioContextRef.current || typeof AudioContext === "undefined") return audioContextRef.current;

        try {
            const context = new AudioContext();
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.78;
            const source = context.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(context.destination);
            audioContextRef.current = context;
            analyserRef.current = analyser;
            mediaSourceRef.current = source;
            return context;
        } catch {
            return null;
        }
    }

    function startVisualizer() {
        resetVisualizer();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const analyser = analyserRef.current;
        const frequencies = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

        const draw = (timestamp: number) => {
            if (!activeAudioIdRef.current) {
                resetVisualizer();
                return;
            }
            if (analyser && frequencies) analyser.getByteFrequencyData(frequencies);
            barsRef.current.forEach((bar, index) => {
                if (!bar) return;
                const frequencyIndex = frequencies
                    ? Math.min(frequencies.length - 1, Math.floor(Math.pow(index / BAR_COUNT, 1.65) * frequencies.length))
                    : 0;
                const measured = frequencies ? frequencies[frequencyIndex] / 255 : 0;
                const fallback = 0.28 + Math.sin(timestamp / 130 + index * 0.72) * 0.16;
                const level = analyser ? 0.12 + measured * 0.88 : fallback;
                const intensity = analyser ? measured : fallback;
                bar.style.transform = `scaleY(${Math.max(0.12, Math.min(1, level))})`;
                bar.style.opacity = `${0.58 + intensity * 0.42}`;
                bar.style.boxShadow = `0 0 ${5 + intensity * 11}px hsla(${BAR_HUES[index]} 95% 65% / ${0.3 + intensity * 0.55})`;
            });
            animationFrameRef.current = requestAnimationFrame(draw);
        };
        animationFrameRef.current = requestAnimationFrame(draw);
    }

    function releaseAudioUrls() {
        audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        audioUrlsRef.current.clear();
    }

    function stopAudio() {
        const audio = audioRef.current;
        const activeId = activeAudioIdRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        activeAudioIdRef.current = null;
        resetVisualizer();
        if (activeId) {
            setVoices((current) => ({ ...current, [activeId]: { ...current[activeId], status: "ready", notice: undefined } }));
        }
    }

    async function playAudio(messageId: string, url: string, automatic = false) {
        const previousId = activeAudioIdRef.current;
        const context = ensureAudioGraph();
        const audio = audioRef.current!;
        if (previousId && previousId !== messageId) stopAudio();
        if (context?.state === "suspended") {
            try { await context.resume(); } catch { /* Native playback may still be available. */ }
        }

        activeAudioIdRef.current = messageId;
        audio.onended = () => {
            if (!mountedRef.current || activeAudioIdRef.current !== messageId) return;
            activeAudioIdRef.current = null;
            resetVisualizer();
            setVoices((current) => ({ ...current, [messageId]: { ...current[messageId], status: "ready", notice: undefined } }));
        };
        audio.onerror = () => {
            if (!mountedRef.current || activeAudioIdRef.current !== messageId) return;
            activeAudioIdRef.current = null;
            resetVisualizer();
            setVoices((current) => ({ ...current, [messageId]: { ...current[messageId], status: "ready", notice: "Não foi possível reproduzir o áudio. Tente novamente." } }));
        };
        audio.src = url;
        audio.currentTime = 0;

        try {
            await audio.play();
            if (!mountedRef.current || activeAudioIdRef.current !== messageId) return;
            setVoices((current) => ({ ...current, [messageId]: { ...current[messageId], status: "playing", notice: undefined } }));
            startVisualizer();
        } catch (playbackError) {
            if (!mountedRef.current || activeAudioIdRef.current !== messageId) return;
            activeAudioIdRef.current = null;
            resetVisualizer();
            const blocked = automatic && playbackError instanceof DOMException && playbackError.name === "NotAllowedError";
            setVoices((current) => ({
                ...current,
                [messageId]: {
                    ...current[messageId], status: "ready",
                    notice: blocked ? "A reprodução automática foi bloqueada. Inicie o áudio manualmente." : "Não foi possível reproduzir o áudio. Tente novamente.",
                },
            }));
        }
    }

    async function requestSpeech(assistantMessage: ConversationMessage) {
        speechRequestRef.current?.controller.abort();
        releaseAudioUrls();
        const audio = audioRef.current;
        if (audio) {
            audio.removeAttribute("src");
            audio.load();
        }

        const controller = new AbortController();
        const truncated = assistantMessage.content.length > MAX_SPEECH_TEXT_LENGTH;
        speechRequestRef.current = { messageId: assistantMessage.id, controller };
        setVoices({ [assistantMessage.id]: { status: "generating", truncated } });
        try {
            const blob = await generateSpeech(assistantMessage.content.slice(0, MAX_SPEECH_TEXT_LENGTH), controller.signal);
            if (!mountedRef.current || speechRequestRef.current?.controller !== controller) return;
            const url = URL.createObjectURL(blob);
            audioUrlsRef.current.add(url);
            speechRequestRef.current = null;
            setVoices({ [assistantMessage.id]: { status: "ready", url, truncated } });
            await playAudio(assistantMessage.id, url, true);
        } catch (speechError) {
            if (speechError instanceof DOMException && speechError.name === "AbortError") return;
            if (!mountedRef.current || speechRequestRef.current?.controller !== controller) return;
            speechRequestRef.current = null;
            setVoices({ [assistantMessage.id]: { status: "generation-error", truncated, notice: "Não foi possível gerar o áudio. Tente novamente." } });
        }
    }

    function interruptVoiceForNewMessage() {
        const pendingSpeech = speechRequestRef.current;
        pendingSpeech?.controller.abort();
        speechRequestRef.current = null;
        if (pendingSpeech) {
            setVoices((current) => ({
                ...current,
                [pendingSpeech.messageId]: {
                    ...current[pendingSpeech.messageId],
                    status: "generation-error",
                    notice: "A geração do áudio anterior foi interrompida.",
                },
            }));
        }
        stopAudio();
    }

    function clearRecordingTimeout() {
        if (recordingTimeoutRef.current !== null) clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
    }

    function clearSilenceTimeout() {
        if (silenceTimeoutRef.current !== null) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
    }

    function stopVoiceActivityMonitoring() {
        clearSilenceTimeout();
        if (voiceActivityIntervalRef.current !== null) clearInterval(voiceActivityIntervalRef.current);
        voiceActivityIntervalRef.current = null;
        recordingSourceRef.current?.disconnect();
        recordingAnalyserRef.current?.disconnect();
        void recordingAudioContextRef.current?.close();
        recordingSourceRef.current = null;
        recordingAnalyserRef.current = null;
        recordingAudioContextRef.current = null;
    }

    function scheduleSilenceStop() {
        clearSilenceTimeout();
        silenceTimeoutRef.current = setTimeout(() => stopRecording("silence"), SILENCE_TIMEOUT_MS);
    }

    function startVoiceActivityMonitoring(stream: MediaStream) {
        speechDetectedRef.current = false;
        consecutiveSpeechSamplesRef.current = 0;
        setVoiceActivityState("waiting");

        if (typeof AudioContext === "undefined") return false;
        try {
            const context = new AudioContext();
            const source = context.createMediaStreamSource(stream);
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.35;
            source.connect(analyser);
            recordingAudioContextRef.current = context;
            recordingSourceRef.current = source;
            recordingAnalyserRef.current = analyser;
            if (context.state === "suspended") void context.resume().catch(() => undefined);

            const samples = new Float32Array(analyser.fftSize);
            voiceActivityIntervalRef.current = setInterval(() => {
                if (mediaRecorderRef.current?.state !== "recording") return;
                analyser.getFloatTimeDomainData(samples);
                let sumSquares = 0;
                let peak = 0;
                for (const sample of samples) {
                    sumSquares += sample * sample;
                    peak = Math.max(peak, Math.abs(sample));
                }
                const rms = Math.sqrt(sumSquares / samples.length);
                const speechSample = rms >= SPEECH_RMS_THRESHOLD && peak >= SPEECH_PEAK_THRESHOLD;

                if (speechSample) {
                    consecutiveSpeechSamplesRef.current += 1;
                    if (
                        speechDetectedRef.current
                        || consecutiveSpeechSamplesRef.current >= SPEECH_CONFIRMATION_SAMPLES
                    ) {
                        speechDetectedRef.current = true;
                        setVoiceActivityState("speaking");
                        scheduleSilenceStop();
                    }
                    return;
                }

                consecutiveSpeechSamplesRef.current = 0;
                if (speechDetectedRef.current) setVoiceActivityState("silence");
            }, VOICE_ACTIVITY_SAMPLE_MS);
            return true;
        } catch {
            stopVoiceActivityMonitoring();
            return false;
        }
    }

    function stopMicrophoneTracks() {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
    }

    function recordingFailureMessage(recordingFailure: unknown) {
        if (recordingFailure instanceof DOMException) {
            if (recordingFailure.name === "NotAllowedError" || recordingFailure.name === "SecurityError") {
                return "A permissão para usar o microfone foi negada. Você ainda pode digitar sua pergunta.";
            }
            if (recordingFailure.name === "NotFoundError" || recordingFailure.name === "DevicesNotFoundError") {
                return "Nenhum microfone foi encontrado. Você ainda pode digitar sua pergunta.";
            }
            if (recordingFailure.name === "NotReadableError" || recordingFailure.name === "TrackStartError") {
                return "O microfone está indisponível ou sendo usado por outro aplicativo.";
            }
        }
        return "Não foi possível acessar o microfone. Você ainda pode digitar sua pergunta.";
    }

    async function finishRecording(session: number, mimeType: string) {
        if (!mountedRef.current || session !== recordingSessionRef.current) return;
        clearRecordingTimeout();
        stopVoiceActivityMonitoring();
        stopMicrophoneTracks();
        mediaRecorderRef.current = null;
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];

        if (!shouldSubmitRecordingRef.current) {
            setRecordingState("idle");
            setVoiceActivityState("waiting");
            setRecordingError(
                recordingStopReasonRef.current === "maximum"
                    ? "O limite de 60 segundos foi atingido sem detectar fala. Tente novamente."
                    : "Nenhuma fala foi detectada. Tente gravar novamente.",
            );
            return;
        }

        if (blob.size === 0) {
            setRecordingState("idle");
            setRecordingError("Nenhum áudio foi capturado. Tente gravar novamente.");
            return;
        }
        if (blob.size > MAX_RECORDING_SIZE) {
            setRecordingState("idle");
            setRecordingError("A gravação excedeu o limite de 24 MB. Faça uma pergunta mais curta.");
            return;
        }

        setRecordingState("transcribing");
        const controller = new AbortController();
        transcriptionControllerRef.current = controller;
        try {
            const transcription = await transcribeAudio(
                blob,
                `question.${recordingExtensionRef.current}`,
                controller.signal,
            );
            if (!mountedRef.current || session !== recordingSessionRef.current) return;
            transcriptionControllerRef.current = null;
            setRecordingState("idle");

            if (transcription.length > MAX_MESSAGE_LENGTH) {
                setMessage(transcription);
                setRecordingError(
                    `A transcrição excedeu ${MAX_MESSAGE_LENGTH.toLocaleString("pt-BR")} caracteres. Edite o texto antes de enviar.`,
                );
                return;
            }

            const sent = await submitQuestion(transcription, false);
            if (!sent && mountedRef.current) setMessage(transcription);
        } catch (transcriptionError) {
            if (transcriptionError instanceof DOMException && transcriptionError.name === "AbortError") return;
            if (!mountedRef.current || session !== recordingSessionRef.current) return;
            transcriptionControllerRef.current = null;
            setRecordingState("idle");
            setRecordingError(
                transcriptionError instanceof Error && transcriptionError.message.includes("vazia")
                    ? "Não foi possível identificar fala na gravação. Tente novamente."
                    : "Não foi possível transcrever o áudio. Você ainda pode digitar sua pergunta.",
            );
        }
    }

    function stopRecording(reason: RecordingStopReason = "manual") {
        const recorder = mediaRecorderRef.current;
        if (recorder?.state !== "recording" || recordingFinalizedRef.current) return;
        recordingFinalizedRef.current = true;
        recordingStopReasonRef.current = reason;
        shouldSubmitRecordingRef.current = speechDetectedRef.current;
        clearRecordingTimeout();
        stopVoiceActivityMonitoring();
        setRecordingState("transcribing");
        recorder.stop();
        stopMicrophoneTracks();
    }

    function cancelRecording() {
        recordingSessionRef.current += 1;
        recordingFinalizedRef.current = true;
        clearRecordingTimeout();
        stopVoiceActivityMonitoring();
        const recorder = mediaRecorderRef.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onerror = null;
            recorder.onstop = null;
            if (recorder.state === "recording") recorder.stop();
        }
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        stopMicrophoneTracks();
        setRecordingState("idle");
        setVoiceActivityState("waiting");
        setRecordingError("");
    }

    async function startRecording() {
        if (loading || recordingState !== "idle") return;
        setRecordingError("");

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setRecordingError("Este navegador não oferece suporte à gravação de áudio. Use o campo de texto.");
            return;
        }

        if (typeof MediaRecorder.isTypeSupported !== "function") {
            setRecordingError("Este navegador não consegue informar um formato de gravação compatível. Use o campo de texto.");
            return;
        }
        const recordingFormat = RECORDING_FORMATS.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
        if (!recordingFormat) {
            setRecordingError("Este navegador não oferece um formato de áudio compatível. Use o campo de texto.");
            return;
        }

        interruptVoiceForNewMessage();
        const session = ++recordingSessionRef.current;
        setRecordingState("requesting-permission");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!mountedRef.current || session !== recordingSessionRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            mediaStreamRef.current = stream;
            const recorder = new MediaRecorder(stream, { mimeType: recordingFormat.mimeType });
            mediaRecorderRef.current = recorder;
            recordingFinalizedRef.current = false;
            shouldSubmitRecordingRef.current = false;
            recordingStopReasonRef.current = "manual";
            recordingExtensionRef.current = recordingFormat.extension;
            recordingChunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordingChunksRef.current.push(event.data);
            };
            recorder.onerror = () => {
                recordingSessionRef.current += 1;
                recordingFinalizedRef.current = true;
                clearRecordingTimeout();
                stopVoiceActivityMonitoring();
                if (recorder.state === "recording") recorder.stop();
                stopMicrophoneTracks();
                mediaRecorderRef.current = null;
                recordingChunksRef.current = [];
                setRecordingState("idle");
                setVoiceActivityState("waiting");
                setRecordingError("A gravação foi interrompida por um erro. Tente novamente.");
            };
            recorder.onstop = () => void finishRecording(session, recorder.mimeType || recordingFormat.mimeType);
            recorder.start();
            if (!startVoiceActivityMonitoring(stream)) {
                cancelRecording();
                setRecordingError(
                    "Este navegador não oferece análise de áudio para detectar silêncio. Use o campo de texto.",
                );
                return;
            }
            setRecordingState("recording");
            recordingTimeoutRef.current = setTimeout(
                () => stopRecording("maximum"),
                MAX_RECORDING_DURATION_MS,
            );
        } catch (recordingFailure) {
            if (!mountedRef.current || session !== recordingSessionRef.current) return;
            stopVoiceActivityMonitoring();
            stopMicrophoneTracks();
            setRecordingState("idle");
            setVoiceActivityState("waiting");
            setRecordingError(recordingFailureMessage(recordingFailure));
        }
    }

    async function submitQuestion(question: string, clearTextInput: boolean) {
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion || loading) return false;
        if (trimmedQuestion.length > MAX_MESSAGE_LENGTH) {
            setError(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH.toLocaleString("pt-BR")} caracteres.`);
            return false;
        }

        interruptVoiceForNewMessage();
        const context = ensureAudioGraph();
        if (context?.state === "suspended") void context.resume().catch(() => undefined);
        const userMessage: ConversationMessage = { id: nextMessageId(), role: "user", content: trimmedQuestion };
        const requestMessages = prepareHistory(messages, userMessage);
        setLoading(true);
        setError("");
        setRecordingError("");
        try {
            const data = await sendMessage(requestMessages);
            const assistantMessage: ConversationMessage = { ...data.message, id: nextMessageId() };
            setMessages([...requestMessages, assistantMessage]);
            if (clearTextInput) setMessage("");
            void requestSpeech(assistantMessage);
            return true;
        } catch {
            setError("Não foi possível enviar sua mensagem. Tente novamente.");
            return false;
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        mountedRef.current = true;
        resetVisualizer();
        const urls = audioUrlsRef.current;
        return () => {
            mountedRef.current = false;
            recordingSessionRef.current += 1;
            recordingFinalizedRef.current = true;
            speechRequestRef.current?.controller.abort();
            transcriptionControllerRef.current?.abort();
            clearRecordingTimeout();
            if (silenceTimeoutRef.current !== null) clearTimeout(silenceTimeoutRef.current);
            if (voiceActivityIntervalRef.current !== null) clearInterval(voiceActivityIntervalRef.current);
            silenceTimeoutRef.current = null;
            voiceActivityIntervalRef.current = null;
            recordingSourceRef.current?.disconnect();
            recordingAnalyserRef.current?.disconnect();
            void recordingAudioContextRef.current?.close();
            recordingSourceRef.current = null;
            recordingAnalyserRef.current = null;
            recordingAudioContextRef.current = null;
            const recorder = mediaRecorderRef.current;
            if (recorder) {
                recorder.ondataavailable = null;
                recorder.onerror = null;
                recorder.onstop = null;
                if (recorder.state === "recording") recorder.stop();
            }
            mediaRecorderRef.current = null;
            recordingChunksRef.current = [];
            stopMicrophoneTracks();
            resetVisualizer();
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
            }
            audioRef.current = null;
            urls.forEach((url) => URL.revokeObjectURL(url));
            urls.clear();
            void audioContextRef.current?.close();
            audioContextRef.current = null;
            analyserRef.current = null;
            mediaSourceRef.current = null;
        };
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (recordingState !== "idle") return;
        await submitQuestion(message, true);
    }

    return (
        <main className="flex min-h-dvh flex-1 flex-col bg-zinc-50 px-4 py-6 font-sans dark:bg-black sm:px-6 sm:py-8">
            <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 text-center">
                <div>
                    <p className="text-base font-semibold tracking-[0.28em] text-orange-600 uppercase">Jarvas</p>

                </div>

                <div className="flex h-36 w-full max-w-xl items-center justify-center gap-1 overflow-hidden px-1 sm:h-48 sm:gap-1.5" role="img" aria-label={latestVoice?.status === "playing" ? "Barras de energia da voz do Jarvas em reprodução" : "Barras de energia da voz do Jarvas paradas"}>
                    {QUIET_LEVELS.map((level, index) => (
                        <span
                            key={index}
                            aria-hidden="true"
                            ref={(element) => { barsRef.current[index] = element; }}
                            className={`h-28 w-[3px] shrink-0 origin-center rounded-full transition-opacity duration-300 sm:h-40 sm:w-1 ${latestVoice?.status === "playing" ? "opacity-95" : "opacity-30"}`}
                            style={{
                                transform: `scaleY(${level})`,
                                background: `linear-gradient(to top, hsl(${BAR_HUES[index]} 92% 58%), hsl(${BAR_HUES[index] - 8} 100% 72%))`,
                                boxShadow: `0 0 5px hsla(${BAR_HUES[index]} 95% 65% / 0.24)`,
                            }}
                        />
                    ))}
                </div>

                <div className="min-h-28 w-full max-w-xl" aria-live="polite">
                    {recordingState === "requesting-permission" && (
                        <p className="flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-300" role="status">
                            <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            Solicitando acesso ao microfone…
                        </p>
                    )}
                    {recordingState === "recording" && (
                        <p className="flex items-center justify-center gap-2 font-medium text-red-600" role="status">
                            <span className="size-2.5 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden="true" />
                            {voiceActivityState === "waiting"
                                ? "Gravando… comece a falar"
                                : voiceActivityState === "speaking"
                                  ? "Gravando… ouvindo sua pergunta"
                                  : "Gravando… aguardando o fim da fala"}
                        </p>
                    )}
                    {recordingState === "transcribing" && (
                        <p className="flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-300" role="status">
                            <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            Transcrevendo sua pergunta…
                        </p>
                    )}
                    {latestVoice?.status === "generating" && (
                        <p className="flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-300"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Gerando áudio…</p>
                    )}
                    {latestAssistant && latestVoice && latestVoice.status !== "generating" && (
                        <div className="flex flex-wrap justify-center gap-3">
                            {latestVoice.status === "playing" ? (
                                <button type="button" onClick={stopAudio} disabled={recordingState !== "idle"} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"><Square className="size-4" aria-hidden="true" />Parar</button>
                            ) : latestVoice.url ? (
                                <button type="button" onClick={() => void playAudio(latestAssistant.id, latestVoice.url!)} disabled={recordingState !== "idle"} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50">
                                    {latestVoice.notice ? <Play className="size-4" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}{latestVoice.notice ? "Reproduzir" : "Repetir"}
                                </button>
                            ) : (
                                <button type="button" onClick={() => void requestSpeech(latestAssistant)} disabled={recordingState !== "idle"} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="size-4" aria-hidden="true" />Tentar gerar novamente</button>
                            )}
                        </div>
                    )}
                    {latestVoice?.truncated && <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">O áudio contém os primeiros {MAX_SPEECH_TEXT_LENGTH.toLocaleString("pt-BR")} caracteres da resposta.</p>}
                    {latestVoice?.notice && <p className="mt-3 text-sm text-red-600" role="alert">{latestVoice.notice}</p>}
                    {recordingError && <p className="mt-3 text-sm text-red-600" role="alert">{recordingError}</p>}
                    {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
                </div>
            </section>

            <form className="mx-auto w-full max-w-2xl pt-4" onSubmit={handleSubmit}>
                <label htmlFor="text" className="sr-only">Pergunte ao Jarvas</label>
                <div className="group flex items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition focus-within:border-orange-400 focus-within:shadow-[0_8px_30px_rgb(249,115,22,0.14)] dark:border-zinc-800 dark:bg-zinc-950">
                    <input type="text" id="text" name="message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Pergunte algo ao Jarvas…" maxLength={MAX_MESSAGE_LENGTH} disabled={loading || recordingState !== "idle"} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed dark:text-zinc-100" />
                    {recordingState === "recording" && (
                        <button type="button" onClick={cancelRecording} aria-label="Cancelar gravação" className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:text-zinc-400 dark:hover:bg-zinc-900">
                            <X className="size-5" aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={recordingState === "recording" ? () => stopRecording("manual") : () => void startRecording()}
                        aria-label={recordingState === "recording" ? "Parar gravação" : "Iniciar gravação"}
                        disabled={loading || recordingState === "requesting-permission" || recordingState === "transcribing"}
                        className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-wait disabled:opacity-60 ${recordingState === "recording" ? "bg-red-500 text-white hover:bg-red-600" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`}
                    >
                        {recordingState === "requesting-permission" || recordingState === "transcribing"
                            ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            : recordingState === "recording"
                              ? <MicOff className="size-5" aria-hidden="true" />
                              : <Mic className="size-5" aria-hidden="true" />}
                    </button>
                    <button type="submit" aria-label="Enviar pergunta" disabled={loading || recordingState !== "idle"} className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 active:scale-95 disabled:cursor-wait disabled:opacity-70">
                        {loading ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                    </button>
                </div>
            </form>
        </main>
    );
}
