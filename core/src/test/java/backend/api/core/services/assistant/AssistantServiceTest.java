package backend.api.core.services.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import backend.api.core.dtos.chat.ChatMessageDTO;
import backend.api.core.dtos.chat.ChatRequestDTO;
import backend.api.core.dtos.chat.ChatResponseDTO;
import backend.api.core.dtos.chat.ChatRole;
import backend.api.core.services.openai.OpenaiService;

class AssistantServiceTest {

    @Test
    void sendsInstructionsSeparatelyFromUserMessage() {
        OpenaiService openaiService = mock(OpenaiService.class);
        AssistantService assistantService = new AssistantService(openaiService);
        List<ChatMessageDTO> messages = List.of(
                new ChatMessageDTO(ChatRole.USER, "Quem foi Albert Einstein?"),
                new ChatMessageDTO(ChatRole.ASSISTANT, "Albert Einstein foi um físico teórico."),
                new ChatMessageDTO(ChatRole.USER, "Onde ele nasceu?"));
        ChatRequestDTO request = new ChatRequestDTO(messages);

        when(openaiService.sendMessages(messages, AssistantInstructions.DEFAULT))
                .thenReturn("Ele nasceu em Ulm, na Alemanha.");

        ChatResponseDTO response = assistantService.chat(request);

        assertEquals(ChatRole.ASSISTANT, response.message().role());
        assertEquals("Ele nasceu em Ulm, na Alemanha.", response.message().content());
        verify(openaiService).sendMessages(eq(messages), eq(AssistantInstructions.DEFAULT));
    }
}
