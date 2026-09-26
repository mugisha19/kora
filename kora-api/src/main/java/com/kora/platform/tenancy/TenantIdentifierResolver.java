package com.kora.platform.tenancy;

import java.util.UUID;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;

/**
 * Feeds {@link TenantScope} to Hibernate, which adds {@code organization_id = ?} to every query on entities with an
 * {@code @TenantId} field and fills that field on insert. That is the "applied centrally, never left to each query"
 * layer of tenant isolation.
 *
 * <p>With no scope bound it returns an id that no organization has, so queries return nothing (fail closed). The
 * system scope is Hibernate's "root" tenant, which sees every organization.
 */
class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<UUID> {

    static final UUID SYSTEM = new UUID(0L, 0L);
    static final UUID NONE = new UUID(-1L, -1L);

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        if (TenantScope.isSystem()) {
            return SYSTEM;
        }
        return TenantScope.organizationId().orElse(NONE);
    }

    @Override
    public boolean isRoot(UUID tenantId) {
        return SYSTEM.equals(tenantId);
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }
}
