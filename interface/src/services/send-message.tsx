const messagesEndpoint = "/api/assistant/chat";

export type ChatRequest = {
    message: string;
};

export type ChatResponse = {
    response: string;
};

export async function sendMessage(message: string): Promise<ChatResponse> {
    const response = await fetch(messagesEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ message } satisfies ChatRequest),
    });

    if (!response.ok) {
        throw new Error(`Falha ao enviar mensagem: ${response.status}`);
    }

    const data: unknown = await response.json();

    if (
        !data ||
        typeof data !== "object" ||
        !("response" in data) ||
        typeof data.response !== "string"
    ) {
        throw new Error("Resposta inválida do servidor");
    }

    return data as ChatResponse;
}
