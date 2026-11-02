package backend.api.core.controllers;

import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import backend.api.core.dtos.error.ErrorResponseDTO;
import backend.api.core.services.openai.InvalidAudioFileException;
import backend.api.core.services.openai.OpenAIServiceException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(OpenAIServiceException.class)
    public ResponseEntity<ErrorResponseDTO> handleOpenAIServiceException(OpenAIServiceException exception) {
        return ResponseEntity
                .status(exception.status())
                .body(new ErrorResponseDTO(exception.getMessage()));
    }

    @ExceptionHandler(InvalidAudioFileException.class)
    public ResponseEntity<ErrorResponseDTO> handleInvalidAudioFileException(InvalidAudioFileException exception) {
        return ResponseEntity
                .status(exception.status())
                .body(new ErrorResponseDTO(exception.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponseDTO> handleMaxUploadSizeExceededException() {
        return ResponseEntity
                .status(413)
                .body(new ErrorResponseDTO("O arquivo de áudio não pode exceder 25 MB."));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ErrorResponseDTO> handleMissingServletRequestPartException() {
        return ResponseEntity
                .badRequest()
                .body(new ErrorResponseDTO("O arquivo de áudio é obrigatório."));
    }
}
