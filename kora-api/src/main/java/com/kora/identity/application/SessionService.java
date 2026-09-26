package com.kora.identity.application;

import com.kora.identity.IdentityErrorCodes;
import com.kora.identity.IssuedSession;
import com.kora.identity.MeView;
import com.kora.identity.Sessions;
import com.kora.identity.application.AccessTokenIssuer.AccessToken;
import com.kora.identity.application.RefreshTokenStore.Rotation;
import com.kora.platform.error.UnauthenticatedException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Starts, refreshes and ends sessions (feature 01). Holds no state itself: tokens live in the store. */
@Service
public class SessionService implements Sessions {

    private static final Logger LOG = LoggerFactory.getLogger(SessionService.class);

    private final RefreshTokenStore refreshTokens;
    private final AccessTokenIssuer accessTokens;
    private final ProfileService profiles;
    private final RefreshTokenProperties properties;

    SessionService(
            RefreshTokenStore refreshTokens,
            AccessTokenIssuer accessTokens,
            ProfileService profiles,
            RefreshTokenProperties properties) {
        this.refreshTokens = refreshTokens;
        this.accessTokens = accessTokens;
        this.profiles = profiles;
        this.properties = properties;
    }

    @Override
    public IssuedSession start(UUID userId) {
        return issue(userId, refreshTokens.startFamily(userId));
    }

    /** Exchanges the refresh cookie for a new access token and a new refresh token (rotation). */
    public IssuedSession refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw invalidRefresh();
        }
        Rotation rotation = refreshTokens.rotate(refreshToken);
        return switch (rotation) {
            case Rotation.Rotated rotated -> {
                try {
                    yield issue(rotated.userId(), rotated.newRefreshToken());
                } catch (UnauthenticatedException accountGone) {
                    refreshTokens.revokeAll(rotated.userId());
                    throw invalidRefresh();
                }
            }
            case Rotation.Rejected rejected -> {
                LOG.info("Refresh token rejected: {}", rejected.reason());
                throw invalidRefresh();
            }
        };
    }

    public void logout(String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            refreshTokens.revokeFamily(refreshToken);
        }
    }

    public void revokeAll(UUID userId) {
        refreshTokens.revokeAll(userId);
    }

    private IssuedSession issue(UUID userId, String refreshToken) {
        MeView me = profiles.me(userId);
        AccessToken accessToken = accessTokens.issue(userId);
        return new IssuedSession(
                accessToken.value(), accessToken.lifetime().toSeconds(), refreshToken, properties.lifetime(), me);
    }

    private static UnauthenticatedException invalidRefresh() {
        return new UnauthenticatedException(IdentityErrorCodes.REFRESH_INVALID, "The session has ended; sign in again");
    }
}
