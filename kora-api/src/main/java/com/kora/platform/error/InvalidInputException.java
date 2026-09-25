package com.kora.platform.error;

import java.util.List;

/**
 * Input that passed syntactic validation but is still unacceptable, e.g. an unknown sort field or a breached
 * password. Rendered as {@code 400 validation.failed} with the violations in {@code errors[]}.
 */
public class InvalidInputException extends ProblemException {

    public InvalidInputException(List<FieldViolation> violations) {
        super(
                ProblemKind.INVALID_INPUT,
                PlatformErrorCodes.VALIDATION_FAILED,
                "The request has invalid fields",
                violations);
    }

    public InvalidInputException(FieldViolation violation) {
        this(List.of(violation));
    }

    public InvalidInputException(String code, String detail) {
        super(ProblemKind.INVALID_INPUT, code, detail);
    }
}
