package backend.api.core.services.assistant;

import org.springframework.stereotype.Service;

import backend.api.core.dtos.chat.ChatRequestDTO;
import backend.api.core.dtos.chat.ChatResponseDTO;
import backend.api.core.services.openai.OpenaiService;

@Service
public class AssistantService {
    private final OpenaiService openAiService;

    public AssistantService(OpenaiService openAiService) {
        this.openAiService = openAiService;
    }

    public ChatResponseDTO chat(ChatRequestDTO request) {

        String response = openAiService.sendMessage(
                request.message(),
                AssistantInstructions.DEFAULT);

        return new ChatResponseDTO(response);
    }
}
