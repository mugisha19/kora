package com.kora.attachments.domain;

/** What an attachment hangs on; each belongs to exactly one project, which decides who sees the file. */
public enum AttachmentOwnerType {
    PROJECT,
    TASK,
    RISK,
    ISSUE,
    CHANGE_REQUEST
}
