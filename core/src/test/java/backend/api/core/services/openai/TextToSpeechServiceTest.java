package backend.api.core.services.openai;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class TextToSpeechServiceTest {

    @Test
    void returnsAudioBytesFromSpeechEndpoint() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TextToSpeechService service = new TextToSpeechService(builder.build());
        byte[] expectedAudio = new byte[] { 1, 2, 3 };

        server.expect(requestTo("https://api.openai.com/v1/audio/speech"))
                .andRespond(withSuccess(expectedAudio, MediaType.parseMediaType("audio/mpeg")));

        assertArrayEquals(expectedAudio, service.generateSpeech("Olá"));
        server.verify();
    }

    @Test
    void rejectsEmptyAudioResponse() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TextToSpeechService service = new TextToSpeechService(builder.build());

        server.expect(requestTo("https://api.openai.com/v1/audio/speech"))
                .andRespond(withSuccess(new byte[0], MediaType.parseMediaType("audio/mpeg")));

        assertThrows(OpenAIServiceException.class, () -> service.generateSpeech("Olá"));
        server.verify();
    }
}
