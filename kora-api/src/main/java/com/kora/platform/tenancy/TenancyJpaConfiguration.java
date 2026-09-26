package com.kora.platform.tenancy;

import org.hibernate.cfg.MultiTenancySettings;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.jpa.autoconfigure.JpaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.JpaVendorAdapter;
import org.springframework.orm.jpa.vendor.HibernateJpaDialect;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

/** Wires {@link TenantScope} into Hibernate (tenant filter) and into every JPA transaction (row-level security). */
@Configuration(proxyBeanMethods = false)
class TenancyJpaConfiguration {

    /**
     * Replaces Spring Boot's default vendor adapter only to swap in {@link TenantAwareJpaDialect}; the settings
     * Boot would apply from {@code spring.jpa.*} are copied over unchanged.
     */
    @Bean
    JpaVendorAdapter jpaVendorAdapter(JpaProperties properties) {
        HibernateJpaDialect dialect = new TenantAwareJpaDialect();
        HibernateJpaVendorAdapter adapter = new HibernateJpaVendorAdapter() {
            @Override
            public HibernateJpaDialect getJpaDialect() {
                return dialect;
            }
        };
        adapter.setShowSql(properties.isShowSql());
        if (properties.getDatabase() != null) {
            adapter.setDatabase(properties.getDatabase());
        }
        if (properties.getDatabasePlatform() != null) {
            adapter.setDatabasePlatform(properties.getDatabasePlatform());
        }
        adapter.setGenerateDdl(properties.isGenerateDdl());
        return adapter;
    }

    @Bean
    HibernatePropertiesCustomizer tenantIdentifierResolver() {
        return hibernate ->
                hibernate.put(MultiTenancySettings.MULTI_TENANT_IDENTIFIER_RESOLVER, new TenantIdentifierResolver());
    }
}
