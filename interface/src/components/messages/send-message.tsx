"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Play, RotateCcw, Square } from "lucide-react";
import { generateSpeech, MAX_SPEECH_TEXT_LENGTH } from "@/services/generate-speech";
import { MAX_MESSAGES, MAX_MESSAGE_LENGTH, MAX_TOTAL_LENGTH, sendMessage, type ChatMessage } from "@/services/send-message";

type ConversationMessage = ChatMessage & { id: string };
type VoiceStatus = "generating" | "ready" | "playing" | "generation-error";
type VoiceState = { status: VoiceStatus; url?: string; notice?: string; truncated?: boolean };

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
        speechRequestRef.current?.controller.abort();
        speechRequestRef.current = null;
        stopAudio();
    }

    useEffect(() => {
        mountedRef.current = true;
        resetVisualizer();
        const urls = audioUrlsRef.current;
        return () => {
            mountedRef.current = false;
            speechRequestRef.current?.controller.abort();
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
        const trimmedMessage = message.trim();
        if (!trimmedMessage || loading) return;
        if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
            setError(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH.toLocaleString("pt-BR")} caracteres.`);
            return;
        }

        interruptVoiceForNewMessage();
        const context = ensureAudioGraph();
        if (context?.state === "suspended") void context.resume().catch(() => undefined);
        const userMessage: ConversationMessage = { id: nextMessageId(), role: "user", content: trimmedMessage };
        const requestMessages = prepareHistory(messages, userMessage);
        setLoading(true);
        setError("");
        try {
            const data = await sendMessage(requestMessages);
            const assistantMessage: ConversationMessage = { ...data.message, id: nextMessageId() };
            setMessages([...requestMessages, assistantMessage]);
            setMessage("");
            void requestSpeech(assistantMessage);
        } catch {
            setError("Não foi possível enviar sua mensagem. Tente novamente.");
        } finally {
            setLoading(false);
        }
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
                    {latestVoice?.status === "generating" && (
                        <p className="flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-300"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Gerando áudio…</p>
                    )}
                    {latestAssistant && latestVoice && latestVoice.status !== "generating" && (
                        <div className="flex flex-wrap justify-center gap-3">
                            {latestVoice.status === "playing" ? (
                                <button type="button" onClick={stopAudio} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:bg-zinc-100 dark:text-zinc-900"><Square className="size-4" aria-hidden="true" />Parar</button>
                            ) : latestVoice.url ? (
                                <button type="button" onClick={() => void playAudio(latestAssistant.id, latestVoice.url!)} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">
                                    {latestVoice.notice ? <Play className="size-4" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}{latestVoice.notice ? "Reproduzir" : "Repetir"}
                                </button>
                            ) : (
                                <button type="button" onClick={() => void requestSpeech(latestAssistant)} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"><RotateCcw className="size-4" aria-hidden="true" />Tentar gerar novamente</button>
                            )}
                        </div>
                    )}
                    {latestVoice?.truncated && <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">O áudio contém os primeiros {MAX_SPEECH_TEXT_LENGTH.toLocaleString("pt-BR")} caracteres da resposta.</p>}
                    {latestVoice?.notice && <p className="mt-3 text-sm text-red-600" role="alert">{latestVoice.notice}</p>}
                    {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
                </div>
            </section>

            <form className="mx-auto w-full max-w-2xl pt-4" onSubmit={handleSubmit}>
                <label htmlFor="text" className="sr-only">Pergunte ao Jarvas</label>
                <div className="group flex items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition focus-within:border-orange-400 focus-within:shadow-[0_8px_30px_rgb(249,115,22,0.14)] dark:border-zinc-800 dark:bg-zinc-950">
                    <input type="text" id="text" name="message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Pergunte algo ao Jarvas…" maxLength={MAX_MESSAGE_LENGTH} disabled={loading} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100" />
                    <button type="submit" aria-label="Enviar pergunta" disabled={loading} className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 active:scale-95 disabled:cursor-wait disabled:opacity-70">
                        {loading ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                    </button>
                </div>
            </form>
        </main>
    );
}
