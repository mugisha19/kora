package com.kora.identity;

/** Error codes the identity module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class IdentityErrorCodes {

    public static final String INVALID_CREDENTIALS = "auth.invalid_credentials";
    public static final String REFRESH_INVALID = "auth.refresh_invalid";
    public static final String EMAIL_TAKEN = "auth.email_taken";
    public static final String RESET_TOKEN_INVALID = "auth.reset_token_invalid";

    /** Field-level reasons (inside {@code errors[]}). */
    public static final class Field {
        public static final String PASSWORD_BREACHED = "password.breached";

        private Field() {}
    }

    private IdentityErrorCodes() {}
}
