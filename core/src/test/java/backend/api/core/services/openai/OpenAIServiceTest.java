package backend.api.core.services.openai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import backend.api.core.dtos.openai.OpenAIResponse;
import backend.api.core.dtos.chat.ChatMessageDTO;
import backend.api.core.dtos.chat.ChatRole;
import backend.api.core.services.assistant.AssistantInstructions;

class OpenAIServiceTest {

    private static final String CHAT_MODEL = "gpt-6-luna";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void serializesConversationInOrderWithoutChangingMessages() throws Exception {
        List<ChatMessageDTO> messages = List.of(
                new ChatMessageDTO(ChatRole.USER, "aspas: \"texto\"\nquebra de linha\\caractere especial"),
                new ChatMessageDTO(ChatRole.ASSISTANT, "Resposta anterior"),
                new ChatMessageDTO(ChatRole.USER, "Onde ele nasceu?"));

        JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(
                OpenaiService.createRequest(messages, AssistantInstructions.DEFAULT, CHAT_MODEL)));

        assertEquals(CHAT_MODEL, json.get("model").asText());
        assertEquals(AssistantInstructions.DEFAULT, json.get("instructions").asText());
        assertEquals(3, json.get("input").size());
        assertEquals("user", json.get("input").get(0).get("role").asText());
        assertEquals(messages.get(0).content(), json.get("input").get(0).get("content").asText());
        assertEquals("assistant", json.get("input").get(1).get("role").asText());
        assertEquals("Resposta anterior", json.get("input").get(1).get("content").asText());
        assertEquals("user", json.get("input").get(2).get("role").asText());
        assertEquals("Onde ele nasceu?", json.get("input").get(2).get("content").asText());
        assertNull(json.get("system"));
    }

    @Test
    void rejectsMissingMessagesOrInstructionsBeforeCallingOpenAI() {
        List<ChatMessageDTO> messages = List.of(
                new ChatMessageDTO(ChatRole.USER, "Mensagem válida"));

        assertThrows(IllegalArgumentException.class,
                () -> OpenaiService.createRequest(null, AssistantInstructions.DEFAULT, CHAT_MODEL));
        assertThrows(IllegalArgumentException.class,
                () -> OpenaiService.createRequest(List.of(), AssistantInstructions.DEFAULT, CHAT_MODEL));
        assertThrows(IllegalArgumentException.class,
                () -> OpenaiService.createRequest(messages, " ", CHAT_MODEL));
        assertThrows(IllegalArgumentException.class,
                () -> OpenaiService.createRequest(messages, AssistantInstructions.DEFAULT, " "));
    }

    @Test
    void sendsConfiguredModelInstructionsAndConversationToResponsesApi() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        OpenaiService service = new OpenaiService(builder.build(), CHAT_MODEL);
        List<ChatMessageDTO> messages = List.of(
                new ChatMessageDTO(ChatRole.USER, "Quem foi Albert Einstein?"),
                new ChatMessageDTO(ChatRole.ASSISTANT, "Foi um físico teórico."),
                new ChatMessageDTO(ChatRole.USER, "Onde ele nasceu?"));

        server.expect(requestTo("https://api.openai.com/v1/responses"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(containsString("\"model\":\"gpt-6-luna\"")))
                .andExpect(content().string(containsString("\"instructions\"")))
                .andExpect(content().string(containsString("Quem foi Albert Einstein?")))
                .andExpect(content().string(containsString("Foi um físico teórico.")))
                .andExpect(content().string(containsString("Onde ele nasceu?")))
                .andRespond(withSuccess(
                        "{\"output\":[{\"type\":\"message\",\"role\":\"assistant\","
                                + "\"content\":[{\"type\":\"output_text\",\"text\":\"Em Ulm, Alemanha.\"}]}]}",
                        MediaType.APPLICATION_JSON));

        assertEquals("Em Ulm, Alemanha.", service.sendMessages(messages, AssistantInstructions.DEFAULT));
        server.verify();
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
