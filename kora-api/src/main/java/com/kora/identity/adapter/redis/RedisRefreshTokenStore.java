package com.kora.identity.adapter.redis;

import com.kora.identity.application.RefreshTokenProperties;
import com.kora.identity.application.RefreshTokenStore;
import com.kora.platform.crypto.OpaqueTokens;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Refresh-token families in Redis (ADR 0007). Keys:
 *
 * <ul>
 *   <li>{@code kora:refresh:token:<sha256>} hash {@code user, family[, rotatedAt]}, expires after the idle lifetime;
 *   <li>{@code kora:refresh:family:<id>} marks a live family, expires at the absolute session limit; deleting it
 *       revokes every token of the family at once;
 *   <li>{@code kora:refresh:user:<id>} set of the user's families, for "sign out everywhere".
 * </ul>
 *
 * Only token hashes are stored. Rotation marks the old token with {@code HSETNX rotatedAt}: an atomic
 * first-writer-wins, so of two concurrent refreshes with the same token exactly one succeeds, on any number of API
 * instances.
 */
@Component
class RedisRefreshTokenStore implements RefreshTokenStore {

    private static final Logger LOG = LoggerFactory.getLogger(RedisRefreshTokenStore.class);

    private static final String TOKEN = "kora:refresh:token:";
    private static final String FAMILY = "kora:refresh:family:";
    private static final String USER = "kora:refresh:user:";
    private static final String USER_FIELD = "user";
    private static final String FAMILY_FIELD = "family";
    private static final String ROTATED_AT_FIELD = "rotatedAt";

    private final StringRedisTemplate redis;
    private final RefreshTokenProperties properties;
    private final Clock clock;

    RedisRefreshTokenStore(StringRedisTemplate redis, RefreshTokenProperties properties, Clock clock) {
        this.redis = redis;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public String startFamily(UUID userId) {
        String familyId = UUID.randomUUID().toString();
        Duration familyLifetime = properties.familyLifetime();
        redis.opsForValue().set(FAMILY + familyId, userId.toString(), familyLifetime);
        redis.opsForSet().add(USER + userId, familyId);
        redis.expire(USER + userId, familyLifetime);
        return newToken(userId.toString(), familyId);
    }

    @Override
    public Rotation rotate(String refreshToken) {
        String tokenKey = TOKEN + OpaqueTokens.hash(refreshToken);
        HashOperations<String, String, String> hashes = redis.opsForHash();
        Map<String, String> token = hashes.entries(tokenKey);
        if (token.isEmpty()) {
            return new Rotation.Rejected("unknown or expired token");
        }
        String familyId = token.get(FAMILY_FIELD);
        if (!Boolean.TRUE.equals(redis.hasKey(FAMILY + familyId))) {
            return new Rotation.Rejected("session revoked or past its absolute lifetime");
        }
        Instant now = clock.instant();
        boolean firstUse = Boolean.TRUE.equals(hashes.putIfAbsent(tokenKey, ROTATED_AT_FIELD, now.toString()));
        if (!firstUse) {
            return reuse(tokenKey, familyId, now);
        }
        String userId = token.get(USER_FIELD);
        return new Rotation.Rotated(UUID.fromString(userId), newToken(userId, familyId));
    }

    @Override
    public void revokeFamily(String refreshToken) {
        String tokenKey = TOKEN + OpaqueTokens.hash(refreshToken);
        Object familyId = redis.opsForHash().get(tokenKey, FAMILY_FIELD);
        if (familyId != null) {
            redis.delete(FAMILY + familyId);
        }
        redis.delete(tokenKey);
    }

    @Override
    public void revokeAll(UUID userId) {
        Set<String> families = redis.opsForSet().members(USER + userId);
        if (families != null) {
            families.forEach(familyId -> redis.delete(FAMILY + familyId));
        }
        redis.delete(USER + userId);
    }

    /**
     * The token was already exchanged. Within the grace period that's two tabs refreshing at once: the other tab
     * already holds the new cookie, so just reject this call. Later, it means a copied token: revoke the family.
     */
    private Rotation reuse(String tokenKey, String familyId, Instant now) {
        Object rotatedAt = redis.opsForHash().get(tokenKey, ROTATED_AT_FIELD);
        boolean withinGrace = rotatedAt != null
                && Duration.between(Instant.parse(rotatedAt.toString()), now).compareTo(properties.reuseGracePeriod())
                        <= 0;
        if (withinGrace) {
            return new Rotation.Rejected("token already exchanged moments ago (concurrent refresh)");
        }
        redis.delete(FAMILY + familyId);
        LOG.warn("Refresh token reuse detected; session family {} revoked", familyId);
        return new Rotation.Rejected("token reuse detected; session revoked");
    }

    private String newToken(String userId, String familyId) {
        String token = OpaqueTokens.generate();
        String tokenKey = TOKEN + OpaqueTokens.hash(token);
        redis.opsForHash().putAll(tokenKey, Map.of(USER_FIELD, userId, FAMILY_FIELD, familyId));
        redis.expire(tokenKey, properties.lifetime());
        return token;
    }
}
