package com.kora.platform.error;

/**
 * The category of a failure, which decides its HTTP status. Kept free of Spring types so that domain and
 * application code can raise problems without depending on the web layer.
 */
public enum ProblemKind {
    INVALID_INPUT(400),
    UNAUTHENTICATED(401),
    FORBIDDEN(403),
    NOT_FOUND(404),
    CONFLICT(409),
    GONE(410),
    PRECONDITION_FAILED(412),
    PRECONDITION_REQUIRED(428),
    TOO_MANY_REQUESTS(429);

    private final int status;

    ProblemKind(int status) {
        this.status = status;
    }

    public int status() {
        return status;
    }
}
