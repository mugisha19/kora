package com.kora.platform.error;

/**
 * The caller isn't (or is no longer) identified: bad credentials, a missing or expired token, an invalid refresh
 * token. Messages stay generic so they can't be used to discover accounts.
 */
public class UnauthenticatedException extends ProblemException {

    public UnauthenticatedException(String code, String detail) {
        super(ProblemKind.UNAUTHENTICATED, code, detail);
    }
}
