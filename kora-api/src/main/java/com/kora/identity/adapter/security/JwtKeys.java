package com.kora.identity.adapter.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The signing key and the set of keys accepted for verification.
 *
 * <p>Rotation without signing anyone out: deploy the new key as current and move the old public key to
 * {@code previous-keys}. New tokens carry the new {@code kid}; tokens signed with the old key keep verifying until
 * they expire (at most 15 minutes), after which the old key can be dropped.
 */
final class JwtKeys {

    private static final Logger LOG = LoggerFactory.getLogger(JwtKeys.class);

    private final ECKey signingKey;
    private final JWKSet verificationKeys;

    private JwtKeys(ECKey signingKey, JWKSet verificationKeys) {
        this.signingKey = signingKey;
        this.verificationKeys = verificationKeys;
    }

    static JwtKeys from(JwtProperties properties) {
        ECKey signing = hasText(properties.privateKey())
                ? configuredKey(properties)
                : ephemeralKey(properties.allowEphemeralKey());
        List<JWK> verification = new ArrayList<>();
        verification.add(signing.toPublicJWK());
        for (JwtProperties.VerificationKey previous : properties.previousKeys()) {
            verification.add(ecKey(previous.keyId(), publicKey(previous.publicKey()), null));
        }
        return new JwtKeys(signing, new JWKSet(verification));
    }

    ECKey signingKey() {
        return signingKey;
    }

    JWKSet verificationKeys() {
        return verificationKeys;
    }

    private static ECKey configuredKey(JwtProperties properties) {
        if (!hasText(properties.publicKey()) || !hasText(properties.keyId())) {
            throw new IllegalStateException("kora.identity.jwt needs public-key and key-id with private-key");
        }
        return ecKey(properties.keyId(), publicKey(properties.publicKey()), privateKey(properties.privateKey()));
    }

    /** Tokens signed with it die with the process; fine locally, never acceptable in production. */
    private static ECKey ephemeralKey(boolean allowed) {
        if (!allowed) {
            throw new IllegalStateException(
                    "No JWT signing key configured (KORA_IDENTITY_JWT_PRIVATE_KEY) and ephemeral keys are disabled");
        }
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            KeyPair pair = generator.generateKeyPair();
            LOG.warn(
                    "Using an ephemeral JWT signing key: sessions won't survive a restart. Configure one outside dev.");
            return ecKey(
                    "ephemeral-" + UUID.randomUUID(), (ECPublicKey) pair.getPublic(), (ECPrivateKey) pair.getPrivate());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot generate an EC key", e);
        }
    }

    private static ECKey ecKey(String keyId, ECPublicKey publicKey, ECPrivateKey privateKey) {
        ECKey.Builder builder = new ECKey.Builder(Curve.P_256, publicKey)
                .keyID(keyId)
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.ES256);
        if (privateKey != null) {
            builder.privateKey(privateKey);
        }
        return builder.build();
    }

    private static ECPublicKey publicKey(String pem) {
        try {
            return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(der(pem)));
        } catch (GeneralSecurityException | ClassCastException e) {
            throw new IllegalStateException("Invalid EC public key (expected X.509 PEM)", e);
        }
    }

    private static ECPrivateKey privateKey(String pem) {
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(der(pem)));
        } catch (GeneralSecurityException | ClassCastException e) {
            throw new IllegalStateException("Invalid EC private key (expected PKCS#8 PEM)", e);
        }
    }

    private static byte[] der(String pem) {
        String base64 = pem.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", "");
        return Base64.getDecoder().decode(base64);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
