package com.kora.attachments;

/** Error codes the attachments module returns; each is listed in the contract's {@code ErrorCode} enum. */
public final class AttachmentErrorCodes {

    public static final String NOT_UPLOADED = "attachments.not_uploaded";
    public static final String CONTENT_MISMATCH = "attachments.content_mismatch";
    public static final String ALREADY_COMPLETED = "attachments.already_completed";

    private AttachmentErrorCodes() {}
}
