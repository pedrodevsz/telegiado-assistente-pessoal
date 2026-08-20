package backend.api.core.dtos.openai;

public record TextToSpeechRequest(
        String model,
        String voice,
        String input,
        String response_format
) {
}
