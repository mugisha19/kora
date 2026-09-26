package com.kora.identity.adapter.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

/**
 * The README tells operators to pass keys as {@code KORA_IDENTITY_JWT_PRIVATE_KEY} etc. This proves those exact
 * environment variable names reach {@link JwtProperties}, so a deployment can't silently ignore its signing key.
 */
class JwtPropertiesBindingTest {

    @Test
    void theEnvironmentVariablesFromTheReadmeBind() {
        StandardEnvironment environment = new StandardEnvironment();
        environment
                .getPropertySources()
                .addFirst(new SystemEnvironmentPropertySource(
                        StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME + "-test",
                        Map.of(
                                "KORA_IDENTITY_JWT_ISSUER", "kora",
                                "KORA_IDENTITY_JWT_KEY_ID", "key-2026-09",
                                "KORA_IDENTITY_JWT_PRIVATE_KEY", "private-pem",
                                "KORA_IDENTITY_JWT_PUBLIC_KEY", "public-pem",
                                "KORA_IDENTITY_JWT_ALLOW_EPHEMERAL_KEY", "false")));
        ConfigurationPropertySources.attach(environment);

        JwtProperties properties = Binder.get(environment)
                .bind("kora.identity.jwt", JwtProperties.class)
                .get();

        assertThat(properties.keyId()).isEqualTo("key-2026-09");
        assertThat(properties.privateKey()).isEqualTo("private-pem");
        assertThat(properties.publicKey()).isEqualTo("public-pem");
        assertThat(properties.allowEphemeralKey()).isFalse();
    }
}
