package com.kora.platform.storage;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.StringJoiner;
import java.util.TreeMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * AWS Signature Version 4 in the query string ("presigned URL"), the one signing scheme every S3-compatible store
 * accepts. Written here rather than pulling in an SDK: about a hundred lines, checked against AWS's published
 * example (ADR 0013). The payload is never signed ({@code UNSIGNED-PAYLOAD}); the API checks the stored file itself.
 */
final class SigV4Presigner {

    private static final String ALGORITHM = "AWS4-HMAC-SHA256";
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private final String accessKey;
    private final String secretKey;
    private final String region;

    SigV4Presigner(String accessKey, String secretKey, String region) {
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.region = region;
    }

    /**
     * @param target the URL with an already-encoded path and no query
     * @param query extra query parameters (signed), e.g. {@code response-content-disposition}
     * @param headers headers the request must send besides {@code host} (signed), e.g. {@code content-type}
     */
    URI presign(
            String method,
            URI target,
            Map<String, String> query,
            Map<String, String> headers,
            Instant now,
            Duration validity) {
        String timestamp = STAMP.format(now);
        String date = timestamp.substring(0, 8);
        String scope = date + "/" + region + "/s3/aws4_request";

        TreeMap<String, String> signedHeaders = new TreeMap<>();
        signedHeaders.put("host", host(target));
        headers.forEach((name, value) -> signedHeaders.put(name.toLowerCase(), value.strip()));
        String signedHeaderNames = String.join(";", signedHeaders.keySet());

        TreeMap<String, String> parameters = new TreeMap<>(query);
        parameters.put("X-Amz-Algorithm", ALGORITHM);
        parameters.put("X-Amz-Credential", accessKey + "/" + scope);
        parameters.put("X-Amz-Date", timestamp);
        parameters.put("X-Amz-Expires", Long.toString(validity.toSeconds()));
        parameters.put("X-Amz-SignedHeaders", signedHeaderNames);
        String canonicalQuery = canonicalQuery(parameters);

        StringBuilder canonicalHeaders = new StringBuilder();
        signedHeaders.forEach((name, value) ->
                canonicalHeaders.append(name).append(':').append(value).append('\n'));
        String canonicalRequest = String.join(
                "\n",
                method,
                target.getRawPath().isEmpty() ? "/" : target.getRawPath(),
                canonicalQuery,
                canonicalHeaders.toString(),
                signedHeaderNames,
                "UNSIGNED-PAYLOAD");
        String stringToSign = String.join("\n", ALGORITHM, timestamp, scope, hex(sha256(canonicalRequest)));

        byte[] key = hmac(("AWS4" + secretKey).getBytes(StandardCharsets.UTF_8), date);
        key = hmac(key, region);
        key = hmac(key, "s3");
        key = hmac(key, "aws4_request");
        String signature = hex(hmac(key, stringToSign));

        return URI.create(target + "?" + canonicalQuery + "&X-Amz-Signature=" + signature);
    }

    /** Encodes a key for the path: every segment encoded, the slashes kept. */
    static String encodePath(String path) {
        StringJoiner encoded = new StringJoiner("/");
        for (String segment : path.split("/", -1)) {
            encoded.add(encode(segment));
        }
        return encoded.toString();
    }

    /** RFC 3986 percent-encoding as SigV4 wants it: only unreserved characters are left alone. */
    static String encode(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xFF);
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || "-_.~".indexOf(c) >= 0) {
                out.append(c);
            } else {
                out.append('%').append(HexFormat.of().withUpperCase().toHexDigits(b));
            }
        }
        return out.toString();
    }

    private static String canonicalQuery(TreeMap<String, String> parameters) {
        StringJoiner query = new StringJoiner("&");
        parameters.forEach((name, value) -> query.add(encode(name) + "=" + encode(value)));
        return query.toString();
    }

    private static String host(URI target) {
        int port = target.getPort();
        boolean defaultPort = port == -1
                || ("http".equals(target.getScheme()) && port == 80)
                || ("https".equals(target.getScheme()) && port == 443);
        return defaultPort ? target.getHost() : target.getHost() + ":" + port;
    }

    private static byte[] sha256(String text) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static byte[] hmac(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException | InvalidKeyException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static String hex(byte[] bytes) {
        return HexFormat.of().formatHex(bytes);
    }
}
