package backend.api.core.dtos.openai;

public record OpenAIRequest(
        String model,
        String input
) {
}
