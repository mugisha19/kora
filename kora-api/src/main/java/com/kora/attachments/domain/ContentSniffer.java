package com.kora.attachments.domain;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CoderResult;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collection;
import java.util.Locale;
import java.util.Optional;

/**
 * Tells a file's real type from its bytes, never from its name or the client's word (feature 20): magic numbers for
 * binary formats, the package layout for Office files, and strict UTF-8 for text. A renamed executable matches
 * nothing and is refused.
 */
public final class ContentSniffer {

    /** How much of the start of a file is inspected. */
    public static final int HEAD_BYTES = 8192;

    private static final byte[] PDF = ascii("%PDF-");
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] GIF87 = ascii("GIF87a");
    private static final byte[] GIF89 = ascii("GIF89a");
    private static final byte[] RIFF = ascii("RIFF");
    private static final byte[] WEBP = ascii("WEBP");
    private static final byte[] ZIP = {'P', 'K', 3, 4};

    private ContentSniffer() {}

    /** Whether the file is a ZIP container, whose entry names {@link #detect} then needs. */
    public static boolean isZip(byte[] head) {
        return startsWith(head, 0, ZIP);
    }

    /**
     * @param head the first {@link #HEAD_BYTES} bytes (fewer for a small file)
     * @param zipEntries the entry names when {@link #isZip}, otherwise ignored
     */
    public static Optional<FileType> detect(byte[] head, Collection<String> zipEntries) {
        if (startsWith(head, 0, PDF)) {
            return Optional.of(FileType.PDF);
        }
        if (startsWith(head, 0, PNG)) {
            return Optional.of(FileType.PNG);
        }
        if (startsWith(head, 0, JPEG)) {
            return Optional.of(FileType.JPEG);
        }
        if (startsWith(head, 0, GIF87) || startsWith(head, 0, GIF89)) {
            return Optional.of(FileType.GIF);
        }
        if (startsWith(head, 0, RIFF) && startsWith(head, 8, WEBP)) {
            return Optional.of(FileType.WEBP);
        }
        if (isZip(head)) {
            return office(zipEntries);
        }
        return isText(head) ? Optional.of(FileType.TEXT) : Optional.empty();
    }

    /**
     * Word, Excel or PowerPoint by their main part. Macro-enabled documents (a {@code vbaProject.bin} part) are
     * refused whatever their extension says: macros are code.
     */
    private static Optional<FileType> office(Collection<String> entries) {
        if (!entries.contains("[Content_Types].xml")
                || entries.stream()
                        .anyMatch(name -> name.toLowerCase(Locale.ROOT).endsWith("vbaproject.bin"))) {
            return Optional.empty();
        }
        if (entries.contains("word/document.xml")) {
            return Optional.of(FileType.DOCX);
        }
        if (entries.contains("xl/workbook.xml")) {
            return Optional.of(FileType.XLSX);
        }
        if (entries.contains("ppt/presentation.xml")) {
            return Optional.of(FileType.PPTX);
        }
        return Optional.empty();
    }

    /** Valid UTF-8 without NUL or other control characters than tab, line breaks and form feed. */
    static boolean isText(byte[] head) {
        if (head.length == 0) {
            return false;
        }
        CharsetDecoder decoder = StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        CharBuffer text = CharBuffer.allocate(head.length);
        // Not the end of input: the sample may stop in the middle of a multi-byte character.
        CoderResult result = decoder.decode(ByteBuffer.wrap(head), text, false);
        if (result.isError()) {
            return false;
        }
        text.flip();
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            boolean control = c < 0x20 && c != '\t' && c != '\n' && c != '\r' && c != '\f';
            if (control || c == 0x7F) {
                return false;
            }
        }
        return true;
    }

    private static boolean startsWith(byte[] data, int offset, byte[] prefix) {
        return data.length >= offset + prefix.length
                && Arrays.equals(data, offset, offset + prefix.length, prefix, 0, prefix.length);
    }

    private static byte[] ascii(String text) {
        return text.getBytes(StandardCharsets.US_ASCII);
    }
}
