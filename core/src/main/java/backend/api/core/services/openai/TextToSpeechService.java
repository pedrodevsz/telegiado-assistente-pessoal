package backend.api.core.services.openai;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import backend.api.core.dtos.openai.TextToSpeechRequest;

@Service
public class TextToSpeechService {

    private static final String MODEL = "gpt-4o-mini-tts";
    private static final String VOICE = "alloy";

    private final RestClient restClient;

    @Autowired
    public TextToSpeechService(
            RestClient.Builder restClientBuilder,
            @Value("${openai.api-key}") String apiKey) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(10));
        requestFactory.setReadTimeout(Duration.ofSeconds(60));

        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com/v1")
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    TextToSpeechService(RestClient restClient) {
        this.restClient = restClient;
    }

    public byte[] generateSpeech(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Text cannot be null or blank");
        }

        TextToSpeechRequest request = new TextToSpeechRequest(MODEL, VOICE, text, "mp3");
        byte[] audio;
        try {
            audio = restClient
                    .post()
                    .uri("/audio/speech")
                    .body(request)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (requestMessage, responseMessage) -> {
                        throw OpenAIServiceException.fromStatus(responseMessage.getStatusCode().value());
                    })
                    .body(byte[].class);
        } catch (OpenAIServiceException exception) {
            throw exception;
        } catch (ResourceAccessException exception) {
            throw OpenAIServiceException.unavailable(
                    "Não foi possível contactar a OpenAI para gerar o áudio.",
                    exception);
        } catch (RestClientException exception) {
            throw new OpenAIServiceException(
                    HttpStatus.BAD_GATEWAY,
                    "Não foi possível concluir a geração do áudio.",
                    exception);
        }

        if (audio == null || audio.length == 0) {
            throw new OpenAIServiceException(
                    HttpStatus.BAD_GATEWAY,
                    "A OpenAI retornou um áudio vazio.");
        }

        return audio;
    }
}
