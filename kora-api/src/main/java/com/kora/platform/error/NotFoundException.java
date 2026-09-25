package com.kora.platform.error;

/**
 * The resource doesn't exist <em>in the caller's organization</em>. Also used for ids that belong to another
 * tenant, so a guessed id can't reveal that something exists elsewhere (404, never 403).
 */
public class NotFoundException extends ProblemException {

    public NotFoundException(String detail) {
        super(ProblemKind.NOT_FOUND, PlatformErrorCodes.RESOURCE_NOT_FOUND, detail);
    }

    public NotFoundException(String code, String detail) {
        super(ProblemKind.NOT_FOUND, code, detail);
    }

    public static NotFoundException of(String resource, Object id) {
        return new NotFoundException(resource + " " + id + " was not found");
    }
}
