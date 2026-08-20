package backend.api.core.controllers;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import backend.api.core.dtos.error.ErrorResponseDTO;
import backend.api.core.services.openai.OpenAIServiceException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(OpenAIServiceException.class)
    public ResponseEntity<ErrorResponseDTO> handleOpenAIServiceException(OpenAIServiceException exception) {
        return ResponseEntity
                .status(exception.status())
                .body(new ErrorResponseDTO(exception.getMessage()));
    }
}
