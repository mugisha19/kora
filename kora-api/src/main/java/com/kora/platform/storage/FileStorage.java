package com.kora.platform.storage;

import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;

/**
 * Port for the object store holding files (Adapter pattern): S3 or any S3-compatible service. Attachments (feature 20)
 * and generated reports (feature 21) keep their bytes here, never in the database.
 */
public interface FileStorage {

    /** Where a client may PUT the file, sending exactly this {@code Content-Type}, within {@code validity}. */
    URI uploadUrl(String key, String contentType, Duration validity);

    /** Where a client may GET the file within {@code validity}; it downloads as {@code fileName}, never inline. */
    URI downloadUrl(String key, String fileName, Duration validity);

    /** The stored size, or empty when nothing was uploaded under the key. */
    Optional<Long> size(String key);

    InputStream open(String key);

    /** Stores a file the API made itself (a report); clients upload through {@link #uploadUrl} instead. */
    void put(String key, Path file, String contentType);

    /** Removes the file; removing a missing one is not an error. */
    void delete(String key);
}
