package com.kora.identity.domain;

import com.kora.identity.IdentityErrorCodes;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import java.util.Map;

/**
 * What makes a new password acceptable (NIST SP 800-63B style): length rather than composition rules, and not a
 * known breached password. No "one upper-case letter and one symbol" rules: they produce {@code Password1!}.
 */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    private final BreachedPasswords breachedPasswords;

    public PasswordPolicy(BreachedPasswords breachedPasswords) {
        this.breachedPasswords = breachedPasswords;
    }

    /**
     * @param field the request field to report problems on ({@code password} or {@code newPassword})
     * @throws InvalidInputException with a field violation when the password is unacceptable
     */
    public void check(String field, String password) {
        int length = password.codePointCount(0, password.length());
        if (length < MIN_LENGTH || length > MAX_LENGTH) {
            throw new InvalidInputException(new FieldViolation(
                    field,
                    PlatformErrorCodes.Field.LENGTH,
                    "size must be between " + MIN_LENGTH + " and " + MAX_LENGTH,
                    Map.of("min", MIN_LENGTH, "max", MAX_LENGTH)));
        }
        if (breachedPasswords.contains(password)) {
            throw new InvalidInputException(FieldViolation.of(
                    field,
                    IdentityErrorCodes.Field.PASSWORD_BREACHED,
                    "This password appears in known data breaches; choose another"));
        }
    }
}
