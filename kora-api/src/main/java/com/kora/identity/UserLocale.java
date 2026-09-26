package com.kora.identity;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/** The languages Kora speaks: English, French and Kinyarwanda. Used for the UI, emails and exports. */
public enum UserLocale {
    EN("en"),
    FR("fr"),
    RW("rw");

    private final String code;

    UserLocale(String code) {
        this.code = code;
    }

    /** The contract's value: {@code en}, {@code fr} or {@code rw}. */
    public String code() {
        return code;
    }

    public Locale toLocale() {
        return Locale.forLanguageTag(code);
    }

    public static Optional<UserLocale> fromCode(String code) {
        return Arrays.stream(values())
                .filter(locale -> locale.code.equals(code))
                .findFirst();
    }
}
