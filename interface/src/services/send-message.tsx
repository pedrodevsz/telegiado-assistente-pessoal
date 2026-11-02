const messagesEndpoint = "/api/assistant/chat";

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 4_000;
export const MAX_TOTAL_LENGTH = 20_000;

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
    role: ChatRole;
    content: string;
};

export type ChatRequest = {
    messages: ChatMessage[];
};

export type ChatResponse = {
    message: ChatMessage;
};

export async function sendMessage(messages: ChatMessage[]): Promise<ChatResponse> {
    const response = await fetch(messagesEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages } satisfies ChatRequest),
    });

    if (!response.ok) {
        throw new Error(`Falha ao enviar mensagem: ${response.status}`);
    }

    const data: unknown = await response.json();

    if (
        !data ||
        typeof data !== "object" ||
        !("message" in data) ||
        !data.message ||
        typeof data.message !== "object" ||
        !("role" in data.message) ||
        data.message.role !== "assistant" ||
        !("content" in data.message) ||
        typeof data.message.content !== "string" ||
        !data.message.content.trim()
    ) {
        throw new Error("Resposta inválida do servidor");
    }

    return data as ChatResponse;
}
