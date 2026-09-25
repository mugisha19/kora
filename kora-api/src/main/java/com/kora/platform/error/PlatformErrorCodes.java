package com.kora.platform.error;

/**
 * Error codes owned by the platform. Every module declares its own codes in a {@code *ErrorCodes} class, and
 * {@code ErrorCodesContractTest} checks that each one is listed in the contract's {@code ErrorCode} enum, so a
 * client never receives a code it can't know about.
 */
public final class PlatformErrorCodes {

    public static final String VALIDATION_FAILED = "validation.failed";
    public static final String RESOURCE_NOT_FOUND = "resource.not_found";
    public static final String METHOD_NOT_ALLOWED = "method.not_allowed";
    public static final String MEDIA_TYPE_UNSUPPORTED = "media_type.unsupported";
    public static final String STALE_VERSION = "concurrency.stale_version";
    public static final String IF_MATCH_REQUIRED = "concurrency.if_match_required";
    public static final String ACCESS_DENIED = "access.denied";
    public static final String INTERNAL_ERROR = "internal.error";

    /** Field-level reasons used inside {@code errors[]}. */
    public static final class Field {
        public static final String REQUIRED = "required";
        public static final String LENGTH = "length";
        public static final String FORMAT = "format";
        public static final String EMAIL = "email";
        public static final String RANGE = "range";
        public static final String INVALID = "invalid";

        private Field() {}
    }

    private PlatformErrorCodes() {}
}
