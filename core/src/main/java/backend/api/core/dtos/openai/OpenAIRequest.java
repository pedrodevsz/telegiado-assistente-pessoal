package backend.api.core.dtos.openai;

import java.util.List;

public record OpenAIRequest(
        String model,
        String instructions,
        List<Message> input
) {
    public record Message(
            String role,
            String content
    ) {
    }
}
