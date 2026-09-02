"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateSpeech } from "@/services/generate-speech";

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

type PlaybackRate = (typeof PLAYBACK_RATES)[number];
type AudioStatus = "idle" | "generating" | "playing" | "paused";

function isAbortError(error: unknown) {
    return error instanceof Error && error.name === "AbortError";
}

export function useAudioController() {
    const [status, setStatus] = useState<AudioStatus>("idle");
    const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
    const [audioError, setAudioError] = useState("");

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const operationIdRef = useRef(0);
    const playbackRateRef = useRef<PlaybackRate>(1);

    const releaseCurrentAudio = useCallback(() => {
        const audio = audioRef.current;

        if (audio) {
            audio.onplay = null;
            audio.onpause = null;
            audio.onended = null;
            audio.onerror = null;
            audio.pause();
            audio.currentTime = 0;
            audioRef.current = null;
        }

        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);

    const cancelAudio = useCallback(() => {
        operationIdRef.current += 1;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        releaseCurrentAudio();
        setStatus("idle");
        setAudioError("");
    }, [releaseCurrentAudio]);

    const playAudio = useCallback(async (text: string) => {
        const trimmedText = text.trim();

        if (!trimmedText) {
            return;
        }

        operationIdRef.current += 1;
        const operationId = operationIdRef.current;

        abortControllerRef.current?.abort();
        releaseCurrentAudio();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        setStatus("generating");
        setAudioError("");

        try {
            const blob = await generateSpeech(trimmedText, {
                signal: abortController.signal,
            });

            if (
                abortController.signal.aborted ||
                operationIdRef.current !== operationId
            ) {
                return;
            }

            const objectUrl = URL.createObjectURL(blob);

            if (operationIdRef.current !== operationId) {
                URL.revokeObjectURL(objectUrl);
                return;
            }

            const audio = new Audio(objectUrl);
            audio.playbackRate = playbackRateRef.current;
            objectUrlRef.current = objectUrl;
            audioRef.current = audio;
            abortControllerRef.current = null;

            audio.onplay = () => {
                if (audioRef.current === audio) {
                    setStatus("playing");
                    setAudioError("");
                }
            };

            audio.onpause = () => {
                if (audioRef.current === audio && !audio.ended) {
                    setStatus("paused");
                }
            };

            audio.onended = () => {
                if (audioRef.current === audio) {
                    releaseCurrentAudio();
                    setStatus("idle");
                }
            };

            audio.onerror = () => {
                if (audioRef.current === audio) {
                    releaseCurrentAudio();
                    setStatus("idle");
                    setAudioError(
                        "Não foi possível reproduzir o áudio. A resposta textual continua disponível.",
                    );
                }
            };

            try {
                await audio.play();
            } catch (error) {
                if (operationIdRef.current !== operationId) {
                    return;
                }

                releaseCurrentAudio();
                setStatus("idle");
                setAudioError(
                    "Não foi possível reproduzir o áudio. A resposta textual continua disponível.",
                );
            }
        } catch (error) {
            if (
                operationIdRef.current !== operationId ||
                isAbortError(error)
            ) {
                return;
            }

            releaseCurrentAudio();
            setStatus("idle");
            setAudioError(
                "Não foi possível gerar o áudio. A resposta textual continua disponível.",
            );
        } finally {
            if (operationIdRef.current === operationId) {
                abortControllerRef.current = null;
            }
        }
    }, [releaseCurrentAudio]);

    const pauseAudio = useCallback(() => {
        if (audioRef.current && status === "playing") {
            audioRef.current.pause();
        }
    }, [status]);

    const resumeAudio = useCallback(async () => {
        const audio = audioRef.current;

        if (!audio || status !== "paused") {
            return;
        }

        audio.playbackRate = playbackRateRef.current;
        setAudioError("");

        try {
            await audio.play();
        } catch {
            setStatus("paused");
            setAudioError(
                "Não foi possível continuar o áudio. A resposta textual continua disponível.",
            );
        }
    }, [status]);

    const changePlaybackRate = useCallback(() => {
        const currentIndex = PLAYBACK_RATES.indexOf(playbackRateRef.current);
        const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];

        playbackRateRef.current = nextRate;
        setPlaybackRate(nextRate);

        if (audioRef.current) {
            audioRef.current.playbackRate = nextRate;
        }
    }, []);

    useEffect(() => {
        return () => {
            operationIdRef.current += 1;
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            releaseCurrentAudio();
        };
    }, [releaseCurrentAudio]);

    return {
        audioError,
        playbackRate,
        isGeneratingAudio: status === "generating",
        isPlaying: status === "playing",
        isPaused: status === "paused",
        hasActiveAudio: status !== "idle",
        playAudio,
        pauseAudio,
        resumeAudio,
        changePlaybackRate,
        cancelAudio,
    };
}
