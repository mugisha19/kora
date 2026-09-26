package com.kora.identity.adapter.security;

import com.kora.identity.application.AccessTokenIssuer;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/**
 * Signs access tokens (ES256). Claims are minimal: who ({@code sub}), when ({@code iat}, {@code exp}), a unique id
 * ({@code jti}) and the issuer. No roles and no organization: those are resolved per request, so a role change or
 * a removed membership applies immediately instead of when the token expires.
 */
@Component
class NimbusAccessTokenIssuer implements AccessTokenIssuer {

    private final JwtEncoder encoder;
    private final JwtProperties properties;
    private final String keyId;
    private final Clock clock;

    NimbusAccessTokenIssuer(JwtEncoder encoder, JwtProperties properties, JwtKeys keys, Clock clock) {
        this.encoder = encoder;
        this.properties = properties;
        this.keyId = keys.signingKey().getKeyID();
        this.clock = clock;
    }

    @Override
    public AccessToken issue(UUID userId) {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTokenLifetime()))
                .id(UUID.randomUUID().toString())
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.ES256).keyId(keyId).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new AccessToken(token, properties.accessTokenLifetime());
    }
}
