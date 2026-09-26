package com.kora.platform.mail;

import java.util.Objects;

/** A plain-text email. Bodies are rendered by the owning module in the recipient's language. */
public record EmailMessage(String to, String subject, String body) {

    public EmailMessage {
        Objects.requireNonNull(to, "to");
        Objects.requireNonNull(subject, "subject");
        Objects.requireNonNull(body, "body");
    }
}
