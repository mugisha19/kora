package com.kora.demo;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The seeder's HTTP client for Kora's own public API: the demo story is told exactly as a user would, so every rule,
 * event, notification and audit entry is the real one. Any unexpected answer stops the seeding with the problem.
 */
final class DemoApi {

    /** A signed-in demo user in one organization. */
    record Session(String token, UUID userId, UUID organizationId, String email) {

        Session in(UUID organization) {
            return new Session(token, userId, organization, email);
        }
    }

    private final URI base;
    private final JsonMapper json;
    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    DemoApi(URI base, JsonMapper json) {
        this.base = base;
        this.json = json;
    }

    /** A JSON object from alternating names and values; null values are left out. */
    static Map<String, Object> body(Object... namesAndValues) {
        Map<String, Object> body = new LinkedHashMap<>();
        for (int i = 0; i < namesAndValues.length; i += 2) {
            Object value = namesAndValues[i + 1];
            if (value != null) {
                body.put(
                        (String) namesAndValues[i],
                        value instanceof UUID || value instanceof java.time.LocalDate ? value.toString() : value);
            }
        }
        return body;
    }

    Session register(String organizationName, String fullName, String email, String password) {
        JsonNode session = send(
                "POST",
                "/auth/register-organization",
                null,
                null,
                body(
                        "organizationName", organizationName,
                        "fullName", fullName,
                        "email", email,
                        "password", password,
                        "currency", "RWF",
                        "timeZone", "Africa/Kigali"));
        return session(session, email);
    }

    Session login(String email, String password) {
        return session(send("POST", "/auth/login", null, null, body("email", email, "password", password)), email);
    }

    JsonNode get(Session session, String path) {
        return send("GET", path, session, null, null);
    }

    JsonNode post(Session session, String path, Object body) {
        return send("POST", path, session, null, body);
    }

    JsonNode put(Session session, String path, Object body) {
        return send("PUT", path, session, null, body);
    }

    /** A PATCH to an unversioned resource (the caller's own profile). */
    JsonNode patch(Session session, String path, Object body) {
        return send("PATCH", path, session, null, body);
    }

    /** PUT or PATCH to a versioned resource: reads its current ETag first, as a client would. */
    JsonNode update(Session session, String method, String path, Object body) {
        return send(method, path, session, etag(session, path), body);
    }

    /** A POST guarded by another resource's version (e.g. public holidays by the calendar's). */
    JsonNode postMatching(Session session, String path, String versionedPath, Object body) {
        return send("POST", path, session, etag(session, versionedPath), body);
    }

    /** A PUT of bytes to a presigned storage URL (an attachment), outside the API. */
    int upload(String url, String contentType, byte[] content) {
        try {
            return http.send(
                            HttpRequest.newBuilder(URI.create(url))
                                    .header("Content-Type", contentType)
                                    .PUT(HttpRequest.BodyPublishers.ofByteArray(content))
                                    .build(),
                            HttpResponse.BodyHandlers.discarding())
                    .statusCode();
        } catch (IOException failure) {
            return -1;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return -1;
        }
    }

    private String etag(Session session, String path) {
        HttpResponse<String> response = exchange("GET", path, session, null, null);
        return response.headers()
                .firstValue("ETag")
                .orElseThrow(() -> new IllegalStateException("No ETag on GET " + path));
    }

    private JsonNode send(String method, String path, Session session, String ifMatch, Object body) {
        HttpResponse<String> response = exchange(method, path, session, ifMatch, body);
        String text = response.body();
        return text == null || text.isBlank() ? json.createObjectNode() : json.readTree(text);
    }

    private HttpResponse<String> exchange(String method, String path, Session session, String ifMatch, Object body) {
        HttpRequest.Builder request =
                HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(60));
        if (session != null) {
            request.header("Authorization", "Bearer " + session.token());
            request.header("X-Organization-Id", session.organizationId().toString());
        }
        if (ifMatch != null) {
            request.header("If-Match", ifMatch);
        }
        if (body != null) {
            request.header("Content-Type", "application/json");
            request.method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        } else {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        }
        try {
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                throw new IllegalStateException(
                        method + " " + path + " answered " + response.statusCode() + ": " + response.body());
            }
            return response;
        } catch (IOException failure) {
            throw new IllegalStateException(method + " " + path + " failed", failure);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted during " + method + " " + path, interrupted);
        }
    }

    private static Session session(JsonNode response, String email) {
        return new Session(
                response.get("accessToken").asString(),
                UUID.fromString(response.get("user").get("id").asString()),
                UUID.fromString(response.get("user")
                        .get("memberships")
                        .get(0)
                        .get("organizationId")
                        .asString()),
                email);
    }
}
