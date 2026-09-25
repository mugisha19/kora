package com.kora.platform.error;

import java.util.List;

/** The request is valid but breaks a business rule given the current state, e.g. removing the last admin. */
public class ConflictException extends ProblemException {

    public ConflictException(String code, String detail) {
        super(ProblemKind.CONFLICT, code, detail);
    }

    public ConflictException(String code, String detail, List<FieldViolation> violations) {
        super(ProblemKind.CONFLICT, code, detail, violations);
    }
}
