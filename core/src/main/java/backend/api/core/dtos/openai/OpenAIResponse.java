package backend.api.core.dtos.openai;

import java.util.List;

public record OpenAIResponse(
        List<Output> output
) {

    public record Output(
            String type,
            String role,
            List<Content> content
    ) {
    }

    public record Content(
            String type,
            String text
    ) {
    }
}
