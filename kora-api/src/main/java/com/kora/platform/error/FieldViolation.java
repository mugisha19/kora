package com.kora.platform.error;

import java.util.Map;
import java.util.Objects;

/**
 * One field-level problem, rendered as an item of {@code errors[]} in the Problem Details body.
 *
 * @param field request field path, e.g. {@code email} or {@code objectives[2].metric}; {@code body} when the
 *     request body as a whole is unreadable
 * @param code field-agnostic reason ({@code required}, {@code length}, ...) or a domain code
 * @param message English message for developers; clients translate by {@code code}
 * @param params values for the translated message, e.g. {@code min} and {@code max}
 */
public record FieldViolation(String field, String code, String message, Map<String, Object> params) {

    public FieldViolation {
        Objects.requireNonNull(field, "field");
        Objects.requireNonNull(code, "code");
        Objects.requireNonNull(message, "message");
        params = params == null ? Map.of() : Map.copyOf(params);
    }

    public static FieldViolation of(String field, String code, String message) {
        return new FieldViolation(field, code, message, Map.of());
    }
}
