package backend.api.core.dtos.speech;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SpeechRequestDTO(
        @NotBlank(message = "Text cannot be empty")
        @Size(max = 4000, message = "Text cannot exceed 4000 characters") String text
) {
}
