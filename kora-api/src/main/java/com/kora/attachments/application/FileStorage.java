package com.kora.attachments.application;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

/** Port for the object store holding the files (Adapter pattern): S3 or any S3-compatible service. */
public interface FileStorage {

    /** Where a client may PUT the file, sending exactly this {@code Content-Type}, within {@code validity}. */
    URI uploadUrl(String key, String contentType, Duration validity);

    /** Where a client may GET the file within {@code validity}; it downloads as {@code fileName}, never inline. */
    URI downloadUrl(String key, String fileName, Duration validity);

    /** The stored size, or empty when nothing was uploaded under the key. */
    Optional<Long> size(String key);

    InputStream open(String key);

    /** Removes the file; removing a missing one is not an error. */
    void delete(String key);
}
