package com.kora.identity.adapter.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/** Signing keys rotate without signing anyone out: tokens from the previous key keep verifying. */
class JwtKeysTest {

    private static final Duration FIFTEEN_MINUTES = Duration.ofMinutes(15);

    @Test
    void tokensSignedWithThePreviousKeyStillVerifyAfterRotation() throws Exception {
        KeyPair oldPair = generate();
        KeyPair newPair = generate();
        JwtProperties beforeRotation = properties("key-2026-09", oldPair, List.of());
        JwtProperties afterRotation = properties(
                "key-2026-10", newPair, List.of(new JwtProperties.VerificationKey("key-2026-09", pem(oldPair, false))));
        String oldToken = issue(beforeRotation);
        String newToken = issue(afterRotation);

        JwtDecoder decoder = decoder(afterRotation);

        assertThat(decoder.decode(oldToken).getHeaders()).containsEntry("kid", "key-2026-09");
        assertThat(decoder.decode(newToken).getHeaders()).containsEntry("kid", "key-2026-10");
    }

    @Test
    void tokensFromAnUnknownKeyAreRejected() throws Exception {
        String forged = issue(properties("key-attacker", generate(), List.of()));

        assertThatThrownBy(() ->
                        decoder(properties("key-real", generate(), List.of())).decode(forged))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokensFromAnotherIssuerAreRejected() throws Exception {
        KeyPair pair = generate();
        JwtProperties ours = properties("key-1", pair, List.of());
        JwtProperties otherIssuer = new JwtProperties(
                "someone-else", FIFTEEN_MINUTES, "key-1", pem(pair, true), pem(pair, false), List.of(), false);

        assertThatThrownBy(() -> decoder(ours).decode(issue(otherIssuer))).isInstanceOf(JwtException.class);
    }

    @Test
    void refusesToStartWithoutAKeyWhenEphemeralKeysAreOff() {
        JwtProperties noKey = new JwtProperties("kora", FIFTEEN_MINUTES, null, null, null, List.of(), false);

        assertThatThrownBy(() -> JwtKeys.from(noKey)).hasMessageContaining("No JWT signing key configured");
    }

    @Test
    void generatesAnEphemeralKeyForDevelopment() {
        JwtProperties noKey = new JwtProperties("kora", FIFTEEN_MINUTES, null, null, null, List.of(), true);

        assertThat(JwtKeys.from(noKey).signingKey().getKeyID()).startsWith("ephemeral-");
    }

    private static String issue(JwtProperties properties) {
        JwtKeys keys = JwtKeys.from(properties);
        NimbusJwtEncoder encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(keys.signingKey())));
        return new NimbusAccessTokenIssuer(encoder, properties, keys, Clock.systemUTC())
                .issue(UUID.randomUUID())
                .value();
    }

    private static JwtDecoder decoder(JwtProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSource(
                        new ImmutableJWKSet<>(JwtKeys.from(properties).verificationKeys()))
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(properties.issuer()));
        return decoder;
    }

    private static JwtProperties properties(String keyId, KeyPair pair, List<JwtProperties.VerificationKey> previous) {
        return new JwtProperties("kora", FIFTEEN_MINUTES, keyId, pem(pair, true), pem(pair, false), previous, false);
    }

    private static KeyPair generate() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    private static String pem(KeyPair pair, boolean privateKey) {
        byte[] der =
                privateKey ? pair.getPrivate().getEncoded() : pair.getPublic().getEncoded();
        String label = privateKey ? "PRIVATE KEY" : "PUBLIC KEY";
        return "-----BEGIN " + label + "-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der)
                + "\n-----END " + label + "-----\n";
    }
}
