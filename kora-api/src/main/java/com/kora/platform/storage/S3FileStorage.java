package com.kora.platform.storage;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * {@link FileStorage} on S3 or an S3-compatible store (SeaweedFS locally), over plain HTTP with presigned requests:
 * the API signs its own calls the same way it signs the URLs it hands to browsers.
 */
@Component
class S3FileStorage implements FileStorage {

    private static final Logger LOG = LoggerFactory.getLogger(S3FileStorage.class);
    private static final Duration OWN_REQUEST_VALIDITY = Duration.ofMinutes(5);

    private final StorageProperties properties;
    private final SigV4Presigner presigner;
    private final HttpClient http;
    private final Clock clock;
    private final String webBaseUrl;

    S3FileStorage(StorageProperties properties, Clock clock, @Value("${kora.web.base-url}") String webBaseUrl) {
        this.properties = properties;
        this.presigner = new SigV4Presigner(properties.accessKey(), properties.secretKey(), properties.region());
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.clock = clock;
        this.webBaseUrl = webBaseUrl;
    }

    @Override
    public URI uploadUrl(String key, String contentType, Duration validity) {
        return presigner.presign(
                "PUT",
                object(properties.browserEndpoint(), key),
                Map.of(),
                Map.of("content-type", contentType),
                clock.instant(),
                validity);
    }

    @Override
    public URI downloadUrl(String key, String fileName, Duration validity) {
        // Always a download, never rendered inline: an uploaded HTML or SVG can't run in anyone's browser.
        String disposition = "attachment; filename*=UTF-8''" + SigV4Presigner.encode(fileName);
        return presigner.presign(
                "GET",
                object(properties.browserEndpoint(), key),
                Map.of(
                        "response-content-disposition",
                        disposition,
                        "response-content-type",
                        "application/octet-stream"),
                Map.of(),
                clock.instant(),
                validity);
    }

    @Override
    public Optional<Long> size(String key) {
        HttpResponse<Void> response = send(own("HEAD", key), HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() == 404) {
            return Optional.empty();
        }
        requireSuccess(response, "HEAD");
        return response.headers().firstValueAsLong("Content-Length").stream()
                .boxed()
                .findFirst();
    }

    @Override
    public InputStream open(String key) {
        HttpResponse<InputStream> response = send(own("GET", key), HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() != 200) {
            try (InputStream ignored = response.body()) {
                throw new IllegalStateException("Storage GET answered " + response.statusCode());
            } catch (IOException closing) {
                throw new UncheckedIOException(closing);
            }
        }
        return response.body();
    }

    @Override
    public void put(String key, Path file, String contentType) {
        URI url = presigner.presign(
                "PUT",
                object(properties.endpoint(), key),
                Map.of(),
                Map.of("content-type", contentType),
                clock.instant(),
                OWN_REQUEST_VALIDITY);
        try {
            HttpResponse<Void> response = send(
                    HttpRequest.newBuilder(url)
                            .timeout(Duration.ofMinutes(2))
                            .header("Content-Type", contentType)
                            .PUT(HttpRequest.BodyPublishers.ofFile(file)),
                    HttpResponse.BodyHandlers.discarding());
            requireSuccess(response, "PUT");
        } catch (FileNotFoundException missing) {
            throw new UncheckedIOException(missing);
        }
    }

    @Override
    public void delete(String key) {
        HttpResponse<Void> response = send(own("DELETE", key), HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() != 404) {
            requireSuccess(response, "DELETE");
        }
    }

    /** Local development and tests: the bucket, and a CORS rule so the web app can PUT and GET directly. */
    @EventListener(ApplicationReadyEvent.class)
    void createBucket() {
        if (!properties.createBucket()) {
            return;
        }
        try {
            URI bucket = URI.create(properties.endpoint() + "/" + properties.bucket());
            HttpResponse<String> created = send(
                    HttpRequest.newBuilder(presigner.presign(
                                    "PUT", bucket, Map.of(), Map.of(), clock.instant(), OWN_REQUEST_VALIDITY))
                            .PUT(HttpRequest.BodyPublishers.noBody()),
                    HttpResponse.BodyHandlers.ofString());
            if (created.statusCode() >= 300 && created.statusCode() != 409) {
                LOG.warn("Could not create bucket {}: {}", properties.bucket(), created.statusCode());
                return;
            }
            String cors = """
                    <CORSConfiguration><CORSRule><AllowedOrigin>%s</AllowedOrigin><AllowedMethod>PUT</AllowedMethod>\
                    <AllowedMethod>GET</AllowedMethod><AllowedHeader>*</AllowedHeader><MaxAgeSeconds>3000</MaxAgeSeconds>\
                    </CORSRule></CORSConfiguration>""".formatted(webBaseUrl);
            HttpResponse<String> corsSet = send(
                    HttpRequest.newBuilder(presigner.presign(
                                    "PUT", bucket, Map.of("cors", ""), Map.of(), clock.instant(), OWN_REQUEST_VALIDITY))
                            .header("Content-MD5", md5(cors))
                            .PUT(HttpRequest.BodyPublishers.ofString(cors)),
                    HttpResponse.BodyHandlers.ofString());
            if (corsSet.statusCode() >= 300) {
                LOG.warn("Could not set the CORS rule of bucket {}: {}", properties.bucket(), corsSet.statusCode());
            }
        } catch (RuntimeException unavailable) {
            // Attachments fail until storage is up; the rest of the API works without it.
            LOG.warn("Storage is not reachable at {}", properties.endpoint(), unavailable);
        }
    }

    private HttpRequest.Builder own(String method, String key) {
        URI url = presigner.presign(
                method, object(properties.endpoint(), key), Map.of(), Map.of(), clock.instant(), OWN_REQUEST_VALIDITY);
        return HttpRequest.newBuilder(url)
                .timeout(Duration.ofSeconds(30))
                .method(method, HttpRequest.BodyPublishers.noBody());
    }

    private URI object(URI endpoint, String key) {
        return URI.create(
                endpoint + "/" + SigV4Presigner.encode(properties.bucket()) + "/" + SigV4Presigner.encodePath(key));
    }

    private <T> HttpResponse<T> send(HttpRequest.Builder request, HttpResponse.BodyHandler<T> body) {
        try {
            return http.send(request.build(), body);
        } catch (IOException failure) {
            throw new UncheckedIOException("Storage is not reachable", failure);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while calling storage", interrupted);
        }
    }

    private static void requireSuccess(HttpResponse<?> response, String method) {
        if (response.statusCode() >= 300) {
            throw new IllegalStateException("Storage " + method + " answered " + response.statusCode());
        }
    }

    private static String md5(String body) {
        try {
            return Base64.getEncoder()
                    .encodeToString(MessageDigest.getInstance("MD5").digest(body.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
