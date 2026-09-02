"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Pause, Play, Square } from "lucide-react";
import { useAudioController } from "@/hooks/use-audio-controller";
import { sendMessage, type ChatResponse } from "@/services/send-message";

export function SendMessage() {
    const [message, setMessage] = useState("");
    const [response, setResponse] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const {
        audioError,
        playbackRate,
        isGeneratingAudio,
        isPlaying,
        isPaused,
        hasActiveAudio,
        playAudio,
        pauseAudio,
        resumeAudio,
        changePlaybackRate,
        cancelAudio,
    } = useAudioController();

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const trimmedMessage = message.trim();

        if (!trimmedMessage || loading) {
            return;
        }

        setLoading(true);
        setError("");
        setResponse("");
        cancelAudio();

        let data: ChatResponse;
        try {
            data = await sendMessage(trimmedMessage);
        } catch {
            setError("Não foi possível enviar sua mensagem. Tente novamente.");
            return;
        } finally {
            setLoading(false);
        }

        setResponse(data.response);
        void playAudio(data.response);
    }

    return (
        <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
            <form className="w-full max-w-xl" onSubmit={handleSubmit}>
                <label htmlFor="text" className="mb-3 block text-center text-2xl font-semibold text-orange-600">
                    Digite sua mensagem aqui
                </label>
                <div className="group flex items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition focus-within:border-orange-400 focus-within:shadow-[0_8px_30px_rgb(249,115,22,0.14)] dark:border-zinc-800 dark:bg-zinc-950">
                    <input
                        type="text"
                        id="text"
                        name="message"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Escreva uma mensagem..."
                        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                    />
                    <button
                        type="submit"
                        aria-label="Enviar mensagem"
                        disabled={loading}
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-2xl leading-none text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 active:scale-95 cursor-pointer"
                    >
                        {loading ? "…" : <ArrowRight />}
                    </button>
                </div>
                {error && (
                    <p className="mt-3 text-center text-sm text-red-600" role="alert">
                        {error}
                    </p>
                )}
                {isGeneratingAudio && (
                    <p className="mt-3 text-center text-sm text-zinc-500" aria-live="polite">
                        Gerando áudio...
                    </p>
                )}
                {audioError && (
                    <p className="mt-3 text-center text-sm text-amber-600" role="status">
                        {audioError}
                    </p>
                )}
                {response && (
                    <section className="mt-6 rounded-2xl bg-white p-4 text-zinc-800 shadow-sm dark:bg-zinc-950 dark:text-zinc-100">
                        <p aria-live="polite">{response}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Controles de áudio">
                            <button
                                type="button"
                                onClick={isPaused ? resumeAudio : pauseAudio}
                                disabled={!isPlaying && !isPaused}
                                aria-label={isPaused ? "Continuar áudio" : "Pausar áudio"}
                                title={isPaused ? "Continuar áudio" : "Pausar áudio"}
                                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium transition hover:border-orange-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800"
                            >
                                {isPaused ? <Play size={16} /> : <Pause size={16} />}
                                {isPaused ? "Continuar" : "Pausar"}
                            </button>
                            <button
                                type="button"
                                onClick={changePlaybackRate}
                                aria-label={`Velocidade atual ${playbackRate}x. Alterar velocidade`}
                                title="Alterar velocidade de reprodução"
                                className="inline-flex min-w-16 items-center justify-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium transition hover:border-orange-400 hover:text-orange-600 dark:border-zinc-800"
                            >
                                {playbackRate}x
                            </button>
                            <button
                                type="button"
                                onClick={cancelAudio}
                                disabled={!hasActiveAudio}
                                aria-label="Cancelar áudio"
                                title="Cancelar áudio"
                                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium transition hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800"
                            >
                                <Square size={15} fill="currentColor" />
                                Cancelar
                            </button>
                        </div>
                    </section>
                )}
            </form>
        </main>
    );
}
