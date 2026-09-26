package com.kora.platform.tenancy;

import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.ProblemException;
import com.kora.platform.error.ProblemKind;
import java.util.Optional;
import java.util.UUID;

/**
 * Which organization's data the current code may touch. Every tenant-isolation layer reads it: Hibernate's
 * {@code @TenantId} filter ({@link TenantIdentifierResolver}) and PostgreSQL row-level security
 * ({@link TenantAwareJpaDialect}).
 *
 * <p>Three states, and the default is the safe one:
 *
 * <ul>
 *   <li><b>none</b> (default): tenant-owned rows are invisible; forgetting to bind a scope fails closed;
 *   <li><b>organization</b>: bound per request from {@code X-Organization-Id} after the membership check;
 *   <li><b>system</b>: all organizations, only for flows that genuinely cross tenants (signing in, invitation links,
 *       scheduled jobs). It has to be asked for explicitly with {@link #callAsSystem}.
 * </ul>
 *
 * <p><b>Bind the scope before the transaction starts.</b> The database session variable is set when a transaction
 * begins, so rebinding inside a running transaction doesn't change what PostgreSQL lets it see; use a new
 * transaction ({@code REQUIRES_NEW}) inside the new scope instead.
 *
 * <p>Implemented with a {@link ScopedValue} rather than a {@code ThreadLocal}: the binding is immutable, can't leak
 * to the next request on a reused (virtual) thread, and ends exactly when the call returns.
 */
public final class TenantScope {

    private static final ScopedValue<Binding> CURRENT = ScopedValue.newInstance();

    private TenantScope() {}

    /** The bound organization, if the scope is an organization (not none, not system). */
    public static Optional<UUID> organizationId() {
        return CURRENT.isBound() && !CURRENT.get().system()
                ? Optional.of(CURRENT.get().organizationId())
                : Optional.empty();
    }

    public static boolean isSystem() {
        return CURRENT.isBound() && CURRENT.get().system();
    }

    /** The active organization; fails with {@code 400 tenant.header_invalid} when the request didn't name one. */
    public static UUID requireOrganization() {
        return organizationId()
                .orElseThrow(() -> new ProblemException(
                        ProblemKind.INVALID_INPUT,
                        PlatformErrorCodes.TENANT_HEADER_INVALID,
                        "Send the active organization's id in the X-Organization-Id header"));
    }

    public static <T, X extends Throwable> T callAs(UUID organizationId, ScopedValue.CallableOp<T, X> operation)
            throws X {
        return ScopedValue.where(CURRENT, new Binding(organizationId, false)).call(operation);
    }

    public static void runAs(UUID organizationId, Runnable operation) {
        ScopedValue.where(CURRENT, new Binding(organizationId, false)).run(operation);
    }

    public static <T, X extends Throwable> T callAsSystem(ScopedValue.CallableOp<T, X> operation) throws X {
        return ScopedValue.where(CURRENT, new Binding(null, true)).call(operation);
    }

    public static void runAsSystem(Runnable operation) {
        ScopedValue.where(CURRENT, new Binding(null, true)).run(operation);
    }

    /** Value for PostgreSQL's {@code app.org} setting, read by the row-level security policies. */
    static String databaseSetting() {
        if (isSystem()) {
            return "system";
        }
        return organizationId().map(UUID::toString).orElse("");
    }

    private record Binding(UUID organizationId, boolean system) {}
}
