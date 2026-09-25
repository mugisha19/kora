package com.kora.platform.web;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;

/**
 * The id that ties one request together across the web client, the API's logs and the error body.
 *
 * <p>A client-supplied id is reused only when it is short and made of safe characters: anything else could inject
 * text into logs or headers, so it is replaced with a fresh UUID.
 */
public final class CorrelationId {

    public static final String HEADER = "X-Correlation-Id";
    public static final String MDC_KEY = "correlationId";

    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9-]{1,64}");

    private CorrelationId() {}

    /** The id of the request being handled on this thread, if any. */
    public static Optional<String> current() {
        return Optional.ofNullable(MDC.get(MDC_KEY));
    }

    static String resolve(String incoming) {
        return incoming != null && SAFE.matcher(incoming).matches()
                ? incoming
                : UUID.randomUUID().toString();
    }
}
