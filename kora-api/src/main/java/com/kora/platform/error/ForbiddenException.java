package com.kora.platform.error;

/**
 * The caller is known but not allowed to do this: {@code access.denied} for a missing role, or a more specific
 * code such as {@code tenant.forbidden}. Only for resources the caller may know exist; otherwise use
 * {@link NotFoundException}.
 */
public class ForbiddenException extends ProblemException {

    public ForbiddenException(String detail) {
        super(ProblemKind.FORBIDDEN, PlatformErrorCodes.ACCESS_DENIED, detail);
    }

    public ForbiddenException(String code, String detail) {
        super(ProblemKind.FORBIDDEN, code, detail);
    }
}
