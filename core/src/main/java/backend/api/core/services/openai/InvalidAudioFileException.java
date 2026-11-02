package backend.api.core.services.openai;

import org.springframework.http.HttpStatus;

public class InvalidAudioFileException extends RuntimeException {

    private final HttpStatus status;

    public InvalidAudioFileException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
