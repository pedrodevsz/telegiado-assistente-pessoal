package backend.api.core.services.openai;

import java.time.Duration;
import java.util.Locale;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

import backend.api.core.dtos.transcription.TranscriptionResponseDTO;

@Service
public class TranscriptionService {

    public static final long MAX_FILE_SIZE = 25L * 1024 * 1024;

    private static final String MODEL = "gpt-transcribe";
    private static final Map<String, MediaType> SUPPORTED_FORMATS = Map.of(
            "flac", MediaType.parseMediaType("audio/flac"),
            "mp3", MediaType.parseMediaType("audio/mpeg"),
            "mp4", MediaType.parseMediaType("audio/mp4"),
            "mpeg", MediaType.parseMediaType("audio/mpeg"),
            "mpga", MediaType.parseMediaType("audio/mpeg"),
            "m4a", MediaType.parseMediaType("audio/mp4"),
            "ogg", MediaType.parseMediaType("audio/ogg"),
            "wav", MediaType.parseMediaType("audio/wav"),
            "webm", MediaType.parseMediaType("audio/webm"));

    private final RestClient restClient;

    @Autowired
    public TranscriptionService(
            RestClient.Builder restClientBuilder,
            @Value("${openai.api-key}") String apiKey) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(10));
        requestFactory.setReadTimeout(Duration.ofSeconds(120));

        this.restClient = restClientBuilder
                .baseUrl("https://api.openai.com/v1")
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .build();
    }

    TranscriptionService(RestClient restClient) {
        this.restClient = restClient;
    }

    public TranscriptionResponseDTO transcribe(MultipartFile file) {
        AudioFormat audioFormat = validate(file);

        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentDispositionFormData("file", "audio." + audioFormat.extension());
        fileHeaders.setContentType(audioFormat.mediaType());

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("model", MODEL);
        body.add("file", new HttpEntity<>(file.getResource(), fileHeaders));

        TranscriptionResponseDTO response;
        try {
            response = restClient
                    .post()
                    .uri("/audio/transcriptions")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (requestMessage, responseMessage) -> {
                        throw OpenAIServiceException.fromStatus(responseMessage.getStatusCode().value());
                    })
                    .body(TranscriptionResponseDTO.class);
        } catch (OpenAIServiceException exception) {
            throw exception;
        } catch (ResourceAccessException exception) {
            throw OpenAIServiceException.unavailable(
                    "Não foi possível contactar a OpenAI para transcrever o áudio.",
                    exception);
        } catch (RestClientException exception) {
            throw new OpenAIServiceException(
                    HttpStatus.BAD_GATEWAY,
                    "Não foi possível concluir a transcrição do áudio.",
                    exception);
        }

        if (response == null || response.text() == null || response.text().isBlank()) {
            throw new OpenAIServiceException(
                    HttpStatus.BAD_GATEWAY,
                    "A OpenAI retornou uma transcrição vazia.");
        }

        return new TranscriptionResponseDTO(response.text().trim());
    }

    private static AudioFormat validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidAudioFileException(
                    HttpStatus.BAD_REQUEST,
                    "O arquivo de áudio é obrigatório e não pode estar vazio.");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new InvalidAudioFileException(
                    HttpStatus.CONTENT_TOO_LARGE,
                    "O arquivo de áudio não pode exceder 25 MB.");
        }

        String filename = file.getOriginalFilename();
        int extensionSeparator = filename == null ? -1 : filename.lastIndexOf('.');
        String extension = extensionSeparator < 0
                ? ""
                : filename.substring(extensionSeparator + 1).toLowerCase(Locale.ROOT);
        MediaType mediaType = SUPPORTED_FORMATS.get(extension);

        if (mediaType == null) {
            throw new InvalidAudioFileException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Formato de áudio não aceito.");
        }

        return new AudioFormat(extension, mediaType);
    }

    private record AudioFormat(String extension, MediaType mediaType) {
    }
}
