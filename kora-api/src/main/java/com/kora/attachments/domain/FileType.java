package com.kora.attachments.domain;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The file types Kora accepts (feature 20): documents and images people share on projects, nothing executable or
 * scriptable. The extension says what a file claims to be; {@link ContentSniffer} checks what it really is.
 */
public enum FileType {
    PDF("application/pdf", "pdf"),
    PNG("image/png", "png"),
    JPEG("image/jpeg", "jpg", "jpeg"),
    GIF("image/gif", "gif"),
    WEBP("image/webp", "webp"),
    TEXT("text/plain", "txt"),
    CSV("text/csv", "csv"),
    DOCX("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
    XLSX("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    PPTX("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx");

    /** 25 MB: large enough for scanned contracts and slide decks, small enough to check in one pass. */
    public static final long MAX_SIZE_BYTES = 25L * 1024 * 1024;

    private final String mediaType;
    private final List<String> extensions;

    FileType(String mediaType, String... extensions) {
        this.mediaType = mediaType;
        this.extensions = List.of(extensions);
    }

    public String mediaType() {
        return mediaType;
    }

    public static Optional<FileType> ofFileName(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return Optional.empty();
        }
        String extension = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(type -> type.extensions.contains(extension))
                .findFirst();
    }

    /** Whether content detected as {@code detected} is acceptable for a file claiming this type. */
    public boolean accepts(FileType detected) {
        if (this == detected) {
            return true;
        }
        // A CSV file is plain text; nothing in its bytes tells them apart.
        return this == CSV && detected == TEXT;
    }
}
