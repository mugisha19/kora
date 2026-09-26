package com.kora.platform.ratelimit;

import com.kora.platform.crypto.OpaqueTokens;
import com.kora.platform.error.RateLimitedException;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.RedisClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.stereotype.Component;

/**
 * Token buckets in Redis (Bucket4j), shared by every API instance, so a limit holds however many replicas run.
 * Buckets refill greedily (a bit at a time rather than all at the end of the period) and expire once full again,
 * so idle keys don't accumulate in Redis.
 */
@Component
class RedisRateLimiter implements RateLimiter {

    private static final String KEY_PREFIX = "kora:rate-limit:";

    private final ProxyManager<byte[]> buckets;

    RedisRateLimiter(LettuceConnectionFactory connectionFactory) {
        RedisClient client = (RedisClient) connectionFactory.getRequiredNativeClient();
        this.buckets = Bucket4jLettuce.casBasedBuilder(client)
                .expirationAfterWrite(
                        ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(Duration.ofMinutes(1)))
                .build();
    }

    @Override
    public void acquire(RateLimit limit, String key) {
        byte[] bucketKey = (KEY_PREFIX + limit.name() + ":" + OpaqueTokens.hash(key)).getBytes(StandardCharsets.UTF_8);
        BucketConfiguration configuration = BucketConfiguration.builder()
                .addLimit(bandwidth ->
                        bandwidth.capacity(limit.capacity()).refillGreedy(limit.capacity(), limit.period()))
                .build();
        ConsumptionProbe probe =
                buckets.builder().build(bucketKey, () -> configuration).tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            throw new RateLimitedException(Duration.ofNanos(probe.getNanosToWaitForRefill()));
        }
    }
}
