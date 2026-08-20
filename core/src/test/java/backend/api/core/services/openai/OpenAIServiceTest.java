package backend.api.core.services.openai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import backend.api.core.dtos.openai.OpenAIRequest;
import backend.api.core.dtos.openai.OpenAIResponse;

class OpenAIServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void serializesSpecialCharactersWithoutChangingTheMessage() throws Exception {
        String message = "aspas: \"texto\"\nquebra de linha\\caractere especial";

        JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(
                new OpenAIRequest("gpt-5.6-luna", message)));

        assertEquals("gpt-5.6-luna", json.get("model").asText());
        assertEquals(message, json.get("input").asText());
    }

    @Test
    void extractsOutputText() {
        OpenAIResponse response = new OpenAIResponse(List.of(
                new OpenAIResponse.Output(
                        "message",
                        "assistant",
                        List.of(new OpenAIResponse.Content("output_text", "Resposta válida")))));

        assertEquals("Resposta válida", OpenaiService.extractText(response));
    }

    @Test
    void rejectsNullOutput() {
        assertThrows(OpenAIServiceException.class, () -> OpenaiService.extractText(new OpenAIResponse(null)));
    }

    @Test
    void rejectsEmptyOutput() {
        assertThrows(OpenAIServiceException.class, () -> OpenaiService.extractText(new OpenAIResponse(List.of())));
    }

    @Test
    void rejectsEmptyContent() {
        OpenAIResponse response = new OpenAIResponse(List.of(
                new OpenAIResponse.Output("message", "assistant", List.of())));

        assertThrows(OpenAIServiceException.class, () -> OpenaiService.extractText(response));
    }

    @Test
    void rejectsMissingOutputText() {
        OpenAIResponse response = new OpenAIResponse(List.of(
                new OpenAIResponse.Output(
                        "message",
                        "assistant",
                        List.of(new OpenAIResponse.Content("reasoning", "sem texto")))));

        assertThrows(OpenAIServiceException.class, () -> OpenaiService.extractText(response));
    }

    @Test
    void mapsExternalErrorStatusesToSafeResponses() {
        assertEquals(502, OpenAIServiceException.fromStatus(401).status().value());
        assertEquals(429, OpenAIServiceException.fromStatus(429).status().value());
        assertEquals(502, OpenAIServiceException.fromStatus(503).status().value());
    }
}
