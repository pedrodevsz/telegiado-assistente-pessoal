const speechEndpoint = "/api/assistant/speech";

type GenerateSpeechOptions = {
    signal?: AbortSignal;
};

export async function generateSpeech(
    text: string,
    options: GenerateSpeechOptions = {},
): Promise<Blob> {
    const response = await fetch(speechEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: options.signal,
    });

    if (!response.ok) {
        throw new Error(`Falha ao gerar áudio: ${response.status}`);
    }

    const audio = await response.blob();

    if (audio.size === 0) {
        throw new Error("O servidor retornou um áudio vazio");
    }

    return audio;
}
