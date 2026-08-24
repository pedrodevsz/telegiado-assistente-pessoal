package backend.api.core.services.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import backend.api.core.dtos.chat.ChatRequestDTO;
import backend.api.core.dtos.chat.ChatResponseDTO;
import backend.api.core.services.openai.OpenaiService;

class AssistantServiceTest {

    @Test
    void sendsInstructionsSeparatelyFromUserMessage() {
        OpenaiService openaiService = mock(OpenaiService.class);
        AssistantService assistantService = new AssistantService(openaiService);
        ChatRequestDTO request = new ChatRequestDTO("O que é uma API?");

        when(openaiService.sendMessage(request.message(), AssistantInstructions.DEFAULT))
                .thenReturn("Uma API é uma forma de dois sistemas se comunicarem.");

        ChatResponseDTO response = assistantService.chat(request);

        assertEquals("Uma API é uma forma de dois sistemas se comunicarem.", response.response());
        verify(openaiService).sendMessage(eq(request.message()), eq(AssistantInstructions.DEFAULT));
    }
}
