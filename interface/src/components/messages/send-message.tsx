"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { sendMessage } from "@/services/send-message";

export function SendMessage() {
    const [message, setMessage] = useState("");
    const [response, setResponse] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const trimmedMessage = message.trim();

        if (!trimmedMessage || loading) {
            return;
        }

        setLoading(true);
        setError("");
        setResponse("");

        try {
            const data = await sendMessage(trimmedMessage);
            setResponse(data.response);
        } catch {
            setError("Não foi possível enviar sua mensagem. Tente novamente.");
        } finally {
            setLoading(false);
        }
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
                {response && (
                    <p className="mt-6 rounded-2xl bg-white p-4 text-zinc-800 shadow-sm dark:bg-zinc-950 dark:text-zinc-100" aria-live="polite">
                        {response}
                    </p>
                )}
            </form>
        </main>
    );
}
