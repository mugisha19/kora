package com.kora.attachments.application;

import com.kora.attachments.domain.ContentSniffer;
import com.kora.attachments.domain.FileType;
import com.kora.platform.storage.FileStorage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Component;

/**
 * Reads an uploaded file once: its SHA-256, and its real type. The file goes to a temporary file first, because Office
 * documents are ZIP packages whose entry names come from the central directory at the end; {@link ZipFile} reads that
 * without inflating anything, so a ZIP bomb costs nothing.
 */
@Component
class FileInspector {

    private final FileStorage storage;

    FileInspector(FileStorage storage) {
        this.storage = storage;
    }

    record Inspection(Optional<FileType> detected, String sha256) {}

    Inspection inspect(String key) {
        Path copy = null;
        try {
            copy = Files.createTempFile("kora-attachment-", ".bin");
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new DigestInputStream(storage.open(key), sha256)) {
                Files.copy(in, copy, StandardCopyOption.REPLACE_EXISTING);
            }
            byte[] head;
            try (InputStream in = Files.newInputStream(copy)) {
                head = in.readNBytes(ContentSniffer.HEAD_BYTES);
            }
            List<String> entries = ContentSniffer.isZip(head) ? entries(copy) : List.of();
            return new Inspection(
                    ContentSniffer.detect(head, entries), HexFormat.of().formatHex(sha256.digest()));
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        } finally {
            if (copy != null) {
                try {
                    Files.deleteIfExists(copy);
                } catch (IOException ignored) {
                    // the OS cleans its temp directory
                }
            }
        }
    }

    private static List<String> entries(Path zip) throws IOException {
        try (ZipFile file = new ZipFile(zip.toFile())) {
            return file.stream().limit(10_000).map(ZipEntry::getName).toList();
        } catch (ZipException corrupt) {
            return List.of();
        }
    }
}
