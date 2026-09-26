package com.kora.identity.application;

import com.kora.identity.UserLocale;

/**
 * Internal event: a reset link must be emailed. Carries the raw token only in memory, for the email; the database
 * keeps its hash.
 */
record PasswordResetRequested(String email, String fullName, UserLocale locale, String token) {

    @Override
    public String toString() {
        return "PasswordResetRequested[locale=" + locale + "]";
    }
}
