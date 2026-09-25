package com.kora.platform.error;

/** The resource existed but can no longer be used, e.g. an expired or already-used token. */
public class GoneException extends ProblemException {

    public GoneException(String code, String detail) {
        super(ProblemKind.GONE, code, detail);
    }
}
