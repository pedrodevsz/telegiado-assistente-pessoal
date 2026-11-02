package backend.api.core.dtos.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChatMessageDTO(
        @NotNull(message = "Role is required") ChatRole role,
        @NotBlank(message = "Content cannot be empty")
        @Size(max = ChatLimits.MAX_CONTENT_LENGTH,
                message = "Content cannot exceed {max} characters") String content
) {
}
