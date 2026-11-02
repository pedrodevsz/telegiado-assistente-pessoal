package backend.api.core.services.openai;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

class TranscriptionServiceTest {

    @Test
    void sendsAudioAndModelAsMultipartAndReturnsTranscription() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TranscriptionService service = new TranscriptionService(builder.build());
        MockMultipartFile file = new MockMultipartFile(
                "file", "question.webm", "audio/webm", new byte[] { 1, 2, 3 });

        server.expect(requestTo("https://api.openai.com/v1/audio/transcriptions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.CONTENT_TYPE, containsString("multipart/form-data")))
                .andExpect(content().string(containsString("name=\"model\"")))
                .andExpect(content().string(containsString("gpt-transcribe")))
                .andExpect(content().string(containsString("filename=\"audio.webm\"")))
                .andRespond(withSuccess("{\"text\":\"  Texto transcrito.  \"}", MediaType.APPLICATION_JSON));

        assertEquals("Texto transcrito.", service.transcribe(file).text());
        server.verify();
    }

    @Test
    void rejectsEmptyAudioFile() {
        TranscriptionService service = new TranscriptionService(RestClient.create());
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.wav", "audio/wav", new byte[0]);

        InvalidAudioFileException exception = assertThrows(
                InvalidAudioFileException.class,
                () -> service.transcribe(file));

        assertEquals(HttpStatus.BAD_REQUEST, exception.status());
    }

    @Test
    void rejectsAudioFileAboveLimit() {
        TranscriptionService service = new TranscriptionService(RestClient.create());
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getSize()).thenReturn(TranscriptionService.MAX_FILE_SIZE + 1);

        InvalidAudioFileException exception = assertThrows(
                InvalidAudioFileException.class,
                () -> service.transcribe(file));

        assertEquals(HttpStatus.CONTENT_TOO_LARGE, exception.status());
    }

    @Test
    void rejectsUnsupportedAudioFormat() {
        TranscriptionService service = new TranscriptionService(RestClient.create());
        MockMultipartFile file = new MockMultipartFile(
                "file", "notes.txt", "text/plain", new byte[] { 1 });

        InvalidAudioFileException exception = assertThrows(
                InvalidAudioFileException.class,
                () -> service.transcribe(file));

        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, exception.status());
    }

    @Test
    void rejectsEmptyTranscriptionResponse() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TranscriptionService service = new TranscriptionService(builder.build());
        MockMultipartFile file = new MockMultipartFile(
                "file", "silence.mp3", "audio/mpeg", new byte[] { 1 });

        server.expect(requestTo("https://api.openai.com/v1/audio/transcriptions"))
                .andRespond(withSuccess("{\"text\":\"   \"}", MediaType.APPLICATION_JSON));

        OpenAIServiceException exception = assertThrows(
                OpenAIServiceException.class,
                () -> service.transcribe(file));

        assertEquals(HttpStatus.BAD_GATEWAY, exception.status());
        server.verify();
    }

    @Test
    void mapsExternalErrorToSafeResponse() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TranscriptionService service = new TranscriptionService(builder.build());
        MockMultipartFile file = new MockMultipartFile(
                "file", "question.wav", "audio/wav", new byte[] { 1 });

        server.expect(requestTo("https://api.openai.com/v1/audio/transcriptions"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        OpenAIServiceException exception = assertThrows(
                OpenAIServiceException.class,
                () -> service.transcribe(file));

        assertEquals(HttpStatus.BAD_GATEWAY, exception.status());
        server.verify();
    }

    @Test
    void mapsCommunicationFailureToGatewayTimeout() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.com/v1");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TranscriptionService service = new TranscriptionService(builder.build());
        MockMultipartFile file = new MockMultipartFile(
                "file", "question.m4a", "audio/mp4", new byte[] { 1 });

        server.expect(requestTo("https://api.openai.com/v1/audio/transcriptions"))
                .andRespond(request -> {
                    throw new ResourceAccessException("connection failed");
                });

        OpenAIServiceException exception = assertThrows(
                OpenAIServiceException.class,
                () -> service.transcribe(file));

        assertEquals(HttpStatus.GATEWAY_TIMEOUT, exception.status());
        server.verify();
    }
}
