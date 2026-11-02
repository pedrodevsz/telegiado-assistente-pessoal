package backend.api.core.dtos.chat;

import com.fasterxml.jackson.annotation.JsonProperty;

public enum ChatRole {
    @JsonProperty("user")
    USER("user"),

    @JsonProperty("assistant")
    ASSISTANT("assistant");

    private final String apiValue;

    ChatRole(String apiValue) {
        this.apiValue = apiValue;
    }

    public String apiValue() {
        return apiValue;
    }
}
