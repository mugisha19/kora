package com.kora.platform.error;

/**
 * Optimistic locking at the API edge. The client sends the version it last saw ({@code If-Match}); a use case
 * compares it with the loaded aggregate before changing anything. JPA's {@code @Version} still guards the
 * narrower window between this check and the database write.
 */
public final class OptimisticLock {

    private OptimisticLock() {}

    /** Fails with {@code 412 concurrency.stale_version} when someone else saved since the client last read. */
    public static void check(long expectedVersion, long actualVersion) {
        if (expectedVersion != actualVersion) {
            throw staleVersion();
        }
    }

    public static ProblemException staleVersion() {
        return new ProblemException(
                ProblemKind.PRECONDITION_FAILED,
                PlatformErrorCodes.STALE_VERSION,
                "The resource was changed by someone else; reload it and try again");
    }

    public static ProblemException ifMatchRequired() {
        return new ProblemException(
                ProblemKind.PRECONDITION_REQUIRED,
                PlatformErrorCodes.IF_MATCH_REQUIRED,
                "Send the resource's ETag in an If-Match header to update it");
    }
}
