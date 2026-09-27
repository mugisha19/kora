package com.kora.platform.audit;

import jakarta.persistence.EntityManagerFactory;
import java.time.Clock;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Hooks the entity change auditor into Hibernate once the persistence unit is up. */
@Configuration(proxyBeanMethods = false)
class AuditConfiguration {

    @Bean
    SmartInitializingSingleton entityChangeAuditing(
            EntityManagerFactory entityManagerFactory, ApplicationEventPublisher events, Clock clock) {
        return () -> {
            EntityChangeAuditor auditor = new EntityChangeAuditor(events, clock);
            EventListenerRegistry registry = entityManagerFactory
                    .unwrap(SessionFactoryImplementor.class)
                    .getServiceRegistry()
                    .requireService(EventListenerRegistry.class);
            registry.appendListeners(EventType.POST_INSERT, auditor);
            registry.appendListeners(EventType.POST_UPDATE, auditor);
            registry.appendListeners(EventType.POST_DELETE, auditor);
        };
    }
}
