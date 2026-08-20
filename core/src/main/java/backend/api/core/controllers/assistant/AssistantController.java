package backend.api.core.controllers.assistant;

import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import backend.api.core.dtos.chat.ChatRequestDTO;
import backend.api.core.dtos.chat.ChatResponseDTO;
import backend.api.core.dtos.speech.SpeechRequestDTO;
import backend.api.core.services.assistant.AssistantService;
import backend.api.core.services.openai.TextToSpeechService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/assistant")
public class AssistantController {
    private final AssistantService assistantService;
    private final TextToSpeechService textToSpeechService;

    public AssistantController(
            AssistantService assistantService,
            TextToSpeechService textToSpeechService) {
        this.assistantService = assistantService;
        this.textToSpeechService = textToSpeechService;
    }

    @PostMapping("/chat")
    public ResponseEntity<ChatResponseDTO> chat(
            @Valid @RequestBody ChatRequestDTO request) {

        ChatResponseDTO response = assistantService.chat(request);

        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/speech", produces = "audio/mpeg")
    public ResponseEntity<byte[]> speech(@Valid @RequestBody SpeechRequestDTO request) {
        byte[] audio = textToSpeechService.generateSpeech(request.text());

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/mpeg"))
                .contentLength(audio.length)
                .body(audio);
    }
}
