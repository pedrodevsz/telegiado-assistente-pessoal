package backend.api.core.dtos.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChatRequestDTO(

        @NotBlank(message = "Message cannot be empty")
        @Size(max = 4000, message = "Message cannot exceed 4000 characters") String message

) {
}
