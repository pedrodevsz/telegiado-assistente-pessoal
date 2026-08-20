package backend.api.core.controllers;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import backend.api.core.dtos.chat.ChatResponseDTO;
import backend.api.core.controllers.assistant.AssistantController;
import backend.api.core.services.assistant.AssistantService;
import backend.api.core.services.openai.TextToSpeechService;

@WebMvcTest(AssistantController.class)
class AssistantControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AssistantService assistantService;

    @MockitoBean
    private TextToSpeechService textToSpeechService;

    @Test
    void returnsChatResponseForValidMessage() throws Exception {
        when(assistantService.chat(any())).thenReturn(new ChatResponseDTO("Alfred Nobel foi um inventor."));

        mockMvc.perform(post("/api/assistant/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Quem foi Alfred Nobel?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.response").value("Alfred Nobel foi um inventor."));
    }

    @Test
    void rejectsBlankMessage() throws Exception {
        mockMvc.perform(post("/api/assistant/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsMessageAboveLimit() throws Exception {
        String message = "a".repeat(4001);

        mockMvc.perform(post("/api/assistant/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + message + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void returnsAudioForValidSpeechRequest() throws Exception {
        when(textToSpeechService.generateSpeech("Resposta em áudio"))
                .thenReturn(new byte[] { 1, 2, 3 });

        mockMvc.perform(post("/api/assistant/speech")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"Resposta em áudio\"}"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .contentType(MediaType.parseMediaType("audio/mpeg")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .bytes(new byte[] { 1, 2, 3 }));
    }

    @Test
    void rejectsBlankSpeechRequest() throws Exception {
        mockMvc.perform(post("/api/assistant/speech")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"\"}"))
                .andExpect(status().isBadRequest());
    }
}
