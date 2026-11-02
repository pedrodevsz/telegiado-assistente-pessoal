"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import {
    MAX_MESSAGES,
    MAX_MESSAGE_LENGTH,
    MAX_TOTAL_LENGTH,
    sendMessage,
    type ChatMessage,
} from "@/services/send-message";

function totalContentLength(messages: ChatMessage[]) {
    return messages.reduce((total, current) => total + current.content.length, 0);
}

function prepareHistory(messages: ChatMessage[], userMessage: ChatMessage) {
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
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const trimmedMessage = message.trim();

        if (!trimmedMessage || loading) {
            return;
        }

        if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
            setError(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH.toLocaleString("pt-BR")} caracteres.`);
            return;
        }

        const userMessage: ChatMessage = {
            role: "user",
            content: trimmedMessage,
        };
        const requestMessages = prepareHistory(messages, userMessage);

        setLoading(true);
        setError("");

        try {
            const data = await sendMessage(requestMessages);
            setMessages([...requestMessages, data.message]);
            setMessage("");
        } catch {
            setError("Não foi possível enviar sua mensagem. Tente novamente.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="flex flex-1 flex-col bg-zinc-50 px-4 py-8 font-sans dark:bg-black">
            <section
                aria-label="Histórico da conversa"
                aria-live="polite"
                className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 pb-8"
            >
                {messages.length === 0 ? (
                    <p className="my-auto text-center text-zinc-500 dark:text-zinc-400">
                        Envie uma mensagem para iniciar a conversa.
                    </p>
                ) : (
                    messages.map((current, index) => (
                        <article
                            key={`${index}-${current.role}`}
                            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                                current.role === "user"
                                    ? "ml-auto bg-orange-500 text-white"
                                    : "mr-auto bg-white text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                            }`}
                        >
                            <span className="sr-only">
                                {current.role === "user" ? "Você" : "Jarvas"}:
                            </span>
                            <p className="whitespace-pre-wrap">{current.content}</p>
                        </article>
                    ))
                )}
            </section>
            <form className="mx-auto w-full max-w-2xl" onSubmit={handleSubmit}>
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
                        maxLength={MAX_MESSAGE_LENGTH}
                        disabled={loading}
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
            </form>
        </main>
    );
}
