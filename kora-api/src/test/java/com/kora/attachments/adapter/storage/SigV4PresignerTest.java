package com.kora.attachments.adapter.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SigV4PresignerTest {

    /** The presigned GET example of the AWS documentation (authenticating requests with query parameters). */
    @Test
    void matchesAwsPublishedExample() {
        SigV4Presigner presigner =
                new SigV4Presigner("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1");

        URI url = presigner.presign(
                "GET",
                URI.create("https://examplebucket.s3.amazonaws.com/test.txt"),
                Map.of(),
                Map.of(),
                Instant.parse("2013-05-24T00:00:00Z"),
                Duration.ofSeconds(86400));

        assertThat(url.toString())
                .isEqualTo("https://examplebucket.s3.amazonaws.com/test.txt"
                        + "?X-Amz-Algorithm=AWS4-HMAC-SHA256"
                        + "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request"
                        + "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host"
                        + "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
    }

    @Test
    void signsTheRequiredHeaders() {
        SigV4Presigner presigner = new SigV4Presigner("key", "secret", "us-east-1");
        Instant now = Instant.parse("2026-09-27T10:00:00Z");
        URI target = URI.create("http://localhost:8333/bucket/org/a/b");

        URI plain = presigner.presign("PUT", target, Map.of(), Map.of(), now, Duration.ofMinutes(15));
        URI typed = presigner.presign(
                "PUT", target, Map.of(), Map.of("Content-Type", "application/pdf"), now, Duration.ofMinutes(15));

        assertThat(typed.getRawQuery()).contains("X-Amz-SignedHeaders=content-type%3Bhost");
        assertThat(signature(typed)).isNotEqualTo(signature(plain));
    }

    @Test
    void encodesLikeRfc3986() {
        assertThat(SigV4Presigner.encode("a b/é~_.-")).isEqualTo("a%20b%2F%C3%A9~_.-");
        assertThat(SigV4Presigner.encodePath("org/x y/z")).isEqualTo("org/x%20y/z");
    }

    private static String signature(URI url) {
        return url.getRawQuery().replaceAll(".*X-Amz-Signature=", "");
    }
}
