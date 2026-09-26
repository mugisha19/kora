package com.kora.platform.tenancy;

import jakarta.persistence.EntityManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import org.hibernate.Session;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.transaction.TransactionDefinition;

/**
 * Makes PostgreSQL row-level security apply to every JPA transaction, the last layer of tenant isolation.
 *
 * <p>Right after a transaction begins, it switches to the restricted {@code kora_app} role (which, unlike the owner
 * that runs Flyway, is subject to RLS) and publishes the current {@link TenantScope} as {@code app.org}. Both
 * settings are {@code LOCAL}: PostgreSQL resets them at commit or rollback, so a pooled connection can never carry
 * one request's tenant into the next.
 */
class TenantAwareJpaDialect extends HibernateJpaDialect {

    static final String APPLICATION_ROLE = "kora_app";

    @Override
    public Object beginTransaction(EntityManager entityManager, TransactionDefinition definition) throws SQLException {
        Object transactionData = super.beginTransaction(entityManager, definition);
        String tenant = TenantScope.databaseSetting();
        entityManager.unwrap(Session.class).doWork(connection -> {
            try (Statement role = connection.createStatement()) {
                role.execute("SET LOCAL ROLE " + APPLICATION_ROLE);
            }
            try (PreparedStatement setting = connection.prepareStatement("SELECT set_config('app.org', ?, true)")) {
                setting.setString(1, tenant);
                setting.execute();
            }
        });
        return transactionData;
    }
}
