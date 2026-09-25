package com.kora.platform.error;

import java.util.List;
import java.util.Objects;

/**
 * Base for every expected failure that should reach the client as Problem Details with a stable {@code code}.
 * Unexpected failures are left as ordinary exceptions and become {@code 500 internal.error}.
 *
 * <p>The message is the Problem's {@code detail}: written for developers, never containing secrets or personal data.
 */
public class ProblemException extends RuntimeException {

    private final ProblemKind kind;
    private final String code;
    private final transient List<FieldViolation> violations;

    public ProblemException(ProblemKind kind, String code, String detail) {
        this(kind, code, detail, List.of());
    }

    public ProblemException(ProblemKind kind, String code, String detail, List<FieldViolation> violations) {
        super(detail);
        this.kind = Objects.requireNonNull(kind, "kind");
        this.code = Objects.requireNonNull(code, "code");
        this.violations = List.copyOf(violations);
    }

    public ProblemKind kind() {
        return kind;
    }

    public String code() {
        return code;
    }

    public List<FieldViolation> violations() {
        return violations;
    }
}
