const transcriptionsEndpoint = "/api/assistant/transcriptions";

export type TranscriptionResponse = {
    text: string;
};

export async function transcribeAudio(file: Blob, filename: string, signal?: AbortSignal): Promise<string> {
    const body = new FormData();
    body.append("file", file, filename);

    const response = await fetch(transcriptionsEndpoint, {
        method: "POST",
        body,
        signal,
    });

    if (!response.ok) {
        throw new Error(`Falha ao transcrever áudio: ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("text" in data) || typeof data.text !== "string") {
        throw new Error("Resposta de transcrição inválida");
    }

    const text = data.text.trim();
    if (!text) {
        throw new Error("A transcrição retornada está vazia");
    }

    return text;
}
