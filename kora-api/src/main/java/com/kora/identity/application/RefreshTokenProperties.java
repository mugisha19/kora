package com.kora.identity.application;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Refresh session settings ({@code kora.identity.refresh-token.*}).
 *
 * @param lifetime idle timeout: a session unused for this long ends (each refresh starts it again)
 * @param familyLifetime absolute limit: a session ends this long after sign-in, however active
 * @param reuseGracePeriod reuse of an exchanged token within this window is treated as two tabs refreshing at once
 *     and rejected without revoking the session
 * @param cookieSecure {@code Secure} attribute of the refresh cookie (only ever off for plain-HTTP test setups)
 */
@ConfigurationProperties("kora.identity.refresh-token")
public record RefreshTokenProperties(
        Duration lifetime, Duration familyLifetime, Duration reuseGracePeriod, boolean cookieSecure) {}
