package com.kora.attachments.adapter.storage;

import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Where attachments are stored: any S3-compatible service, addressed path-style ({@code endpoint/bucket/key}).
 *
 * @param endpoint what the API calls
 * @param publicEndpoint what browsers call with presigned URLs; the same unless the API reaches storage through a
 *     private address
 * @param createBucket whether to create the bucket (and its CORS rule) at startup; local development and tests
 */
@Validated
@ConfigurationProperties("kora.storage")
public record StorageProperties(
        URI endpoint,
        URI publicEndpoint,
        @NotBlank String region,
        @NotBlank String bucket,
        @NotBlank String accessKey,
        @NotBlank String secretKey,
        boolean createBucket) {

    public URI browserEndpoint() {
        return publicEndpoint == null ? endpoint : publicEndpoint;
    }
}
