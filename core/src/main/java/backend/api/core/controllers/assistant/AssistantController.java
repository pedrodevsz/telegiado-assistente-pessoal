package backend.api.core.controllers.assistant;

import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import backend.api.core.dtos.chat.ChatRequestDTO;
import backend.api.core.dtos.chat.ChatResponseDTO;
import backend.api.core.dtos.speech.SpeechRequestDTO;
import backend.api.core.dtos.transcription.TranscriptionResponseDTO;
import backend.api.core.services.assistant.AssistantService;
import backend.api.core.services.openai.TextToSpeechService;
import backend.api.core.services.openai.TranscriptionService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/assistant")
public class AssistantController {
    private final AssistantService assistantService;
    private final TextToSpeechService textToSpeechService;
    private final TranscriptionService transcriptionService;

    public AssistantController(
            AssistantService assistantService,
            TextToSpeechService textToSpeechService,
            TranscriptionService transcriptionService) {
        this.assistantService = assistantService;
        this.textToSpeechService = textToSpeechService;
        this.transcriptionService = transcriptionService;
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

    @PostMapping(value = "/transcriptions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TranscriptionResponseDTO> transcribe(
            @RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok(transcriptionService.transcribe(file));
    }
}
