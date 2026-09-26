package com.kora.identity.domain;

import java.util.Locale;

/**
 * Email addresses are compared case-insensitively ({@code Aline@Kora.demo} is the same account as
 * {@code aline@kora.demo}). Normalizing once, on the way in, makes a plain unique index enforce that.
 */
public final class EmailAddresses {

    private EmailAddresses() {}

    public static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }
}
