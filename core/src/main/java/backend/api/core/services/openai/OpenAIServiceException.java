package backend.api.core.services.openai;

import org.springframework.http.HttpStatus;

public class OpenAIServiceException extends RuntimeException {

    private final HttpStatus status;

    public OpenAIServiceException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public OpenAIServiceException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    public static OpenAIServiceException fromStatus(int statusCode) {
        if (statusCode == 401) {
            return new OpenAIServiceException(
                    HttpStatus.BAD_GATEWAY,
                    "A integração com a OpenAI não está autenticada corretamente.");
        }

        if (statusCode == 429) {
            return new OpenAIServiceException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "A OpenAI está temporariamente indisponível por limite de requisições.");
        }

        return new OpenAIServiceException(
                HttpStatus.BAD_GATEWAY,
                "A OpenAI não conseguiu processar a solicitação.");
    }

    public static OpenAIServiceException unavailable(String message, Throwable cause) {
        return new OpenAIServiceException(HttpStatus.GATEWAY_TIMEOUT, message, cause);
    }
}
