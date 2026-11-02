const speechEndpoint = "/api/assistant/speech";

export const MAX_SPEECH_TEXT_LENGTH = 4_000;

export async function generateSpeech(text: string, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(speechEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Falha ao gerar áudio: ${response.status}`);
    }

    const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("audio/mpeg")) {
        throw new Error("Resposta de áudio inválida");
    }

    const audio = await response.blob();
    if (audio.size === 0) {
        throw new Error("O servidor retornou um áudio vazio");
    }

    return audio;
}
