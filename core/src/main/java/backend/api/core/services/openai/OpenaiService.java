package backend.api.core.services.openai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClient;

import java.time.Duration;

import backend.api.core.dtos.openai.OpenAIRequest;
import backend.api.core.dtos.openai.OpenAIResponse;

@Service
public class OpenaiService {

    private final RestClient restClient;

    public OpenaiService(
            RestClient.Builder restClientBuilder,
            @Value("${openai.api-key}") String apiKey) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(10));
        requestFactory.setReadTimeout(Duration.ofSeconds(60));

        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com/v1")
                .requestFactory(requestFactory)
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + apiKey)
                .defaultHeader(
                        HttpHeaders.CONTENT_TYPE,
                        MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public String sendMessage(String message, String instructions) {
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("Message cannot be null or blank");
        }
        if (instructions == null || instructions.isBlank()) {
            throw new IllegalArgumentException("Instructions cannot be null or blank");
        }

        OpenAIRequest request = new OpenAIRequest("gpt-5.6-luna", instructions, message);
        OpenAIResponse response;
        try {
            response = restClient
                    .post()
                    .uri("/responses")
                    .body(request)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (requestMessage, responseMessage) -> {
                        throw OpenAIServiceException.fromStatus(responseMessage.getStatusCode().value());
                    })
                    .body(OpenAIResponse.class);
        } catch (OpenAIServiceException exception) {
            throw exception;
        } catch (ResourceAccessException exception) {
            throw OpenAIServiceException.unavailable(
                    "Não foi possível contactar a OpenAI.",
                    exception);
        } catch (RestClientException exception) {
            throw new OpenAIServiceException(
                    org.springframework.http.HttpStatus.BAD_GATEWAY,
                    "Não foi possível concluir a comunicação com a OpenAI.",
                    exception);
        }

        return extractText(response);
    }

    static String extractText(OpenAIResponse response) {
        if (response == null || response.output() == null) {
            throw new OpenAIServiceException(
                    org.springframework.http.HttpStatus.BAD_GATEWAY,
                    "A OpenAI retornou uma resposta inválida.");
        }

        for (OpenAIResponse.Output output : response.output()) {
            if (output == null || output.content() == null) {
                continue;
            }

            for (OpenAIResponse.Content content : output.content()) {
                if (content == null
                        || !"output_text".equals(content.type())
                        || content.text() == null
                        || content.text().isBlank()) {
                    continue;
                }

                return content.text();
            }
        }

        throw new OpenAIServiceException(
                org.springframework.http.HttpStatus.BAD_GATEWAY,
                "A OpenAI retornou uma resposta sem texto.");
    }
}
