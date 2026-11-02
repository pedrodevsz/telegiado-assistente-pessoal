package backend.api.core.dtos.chat;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChatRequestDTO(
        @NotEmpty(message = "Messages cannot be empty")
        @Size(max = ChatLimits.MAX_MESSAGES, message = "Conversation cannot exceed {max} messages")
        List<@NotNull(message = "Message cannot be null") @Valid ChatMessageDTO> messages
) {

    @AssertTrue(message = "Conversation content cannot exceed 20000 characters")
    public boolean isTotalContentWithinLimit() {
        if (messages == null) {
            return true;
        }

        long totalLength = messages.stream()
                .filter(message -> message != null && message.content() != null)
                .mapToLong(message -> message.content().length())
                .sum();

        return totalLength <= ChatLimits.MAX_TOTAL_CONTENT_LENGTH;
    }

    @AssertTrue(message = "Conversation must start with a user message")
    public boolean isFirstMessageFromUser() {
        return messages == null
                || messages.isEmpty()
                || messages.getFirst() == null
                || messages.getFirst().role() == null
                || messages.getFirst().role() == ChatRole.USER;
    }

    @AssertTrue(message = "Latest message must be from the user")
    public boolean isLatestMessageFromUser() {
        return messages == null
                || messages.isEmpty()
                || messages.getLast() == null
                || messages.getLast().role() == null
                || messages.getLast().role() == ChatRole.USER;
    }

    @AssertTrue(message = "Conversation roles must alternate")
    public boolean hasAlternatingRoles() {
        if (messages == null || messages.size() < 2) {
            return true;
        }

        for (int index = 1; index < messages.size(); index++) {
            ChatMessageDTO previous = messages.get(index - 1);
            ChatMessageDTO current = messages.get(index);

            if (previous == null || current == null || previous.role() == null || current.role() == null) {
                continue;
            }

            if (previous.role() == current.role()) {
                return false;
            }
        }

        return true;
    }
}
