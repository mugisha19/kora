package com.kora.platform.tenancy;

import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs work in a given tenant scope <em>and</em> a new transaction started inside that scope, in that order. Doing
 * both in one call makes the rule of {@link TenantScope} (bind first, then begin the transaction) impossible to get
 * wrong. {@code REQUIRES_NEW} guarantees a fresh transaction even when called from inside another one.
 */
@Component
public class TenantTransactions {

    private final TransactionTemplate readWrite;
    private final TransactionTemplate readOnly;

    TenantTransactions(PlatformTransactionManager transactionManager) {
        this.readWrite = new TransactionTemplate(transactionManager);
        this.readWrite.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.readOnly = new TransactionTemplate(transactionManager);
        this.readOnly.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.readOnly.setReadOnly(true);
    }

    public <T> T inOrganization(UUID organizationId, Supplier<T> work) {
        return TenantScope.callAs(organizationId, () -> readWrite.execute(status -> work.get()));
    }

    public <T> T readInOrganization(UUID organizationId, Supplier<T> work) {
        return TenantScope.callAs(organizationId, () -> readOnly.execute(status -> work.get()));
    }

    /** Across organizations. Only for flows that genuinely need it; see {@link TenantScope}. */
    public <T> T inSystem(Supplier<T> work) {
        return TenantScope.callAsSystem(() -> readWrite.execute(status -> work.get()));
    }

    /** Across organizations, read-only. */
    public <T> T readInSystem(Supplier<T> work) {
        return TenantScope.callAsSystem(() -> readOnly.execute(status -> work.get()));
    }
}
