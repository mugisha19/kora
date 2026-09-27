package com.kora.attachments.domain;

/** {@code PENDING} until the uploaded file has been checked; only {@code AVAILABLE} files are listed. */
public enum AttachmentStatus {
    PENDING,
    AVAILABLE
}
