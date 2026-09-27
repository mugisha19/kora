package com.kora.platform.audit;

import com.kora.platform.audit.AuditRecord.Outcome;
import com.kora.platform.tenancy.TenantScope;
import com.kora.platform.tenancy.TenantTransactions;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.SQLException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Explicit audit entries for what isn't an entity change: refused access and signing in (feature 19). Each is written
 * in a transaction of its own, because the request that caused it is failing (403) or has nothing else to commit.
 */
@Component
public class AuditTrail {

    private static final Logger LOG = LoggerFactory.getLogger(AuditTrail.class);

    private final TenantTransactions transactions;
    private final Clock clock;

    @PersistenceContext
    private EntityManager entityManager;

    AuditTrail(TenantTransactions transactions, Clock clock) {
        this.transactions = transactions;
        this.clock = clock;
    }

    /** A refused request (403), in the organization it was aimed at. */
    public void denied(HttpServletRequest request) {
        AuditContext.Origin origin = AuditContext.current();
        UUID organization = TenantScope.organizationId().orElse(null);
        String target = request.getMethod() + " " + request.getRequestURI();
        write(new AuditRecord(
                organization,
                now(),
                origin.actorId(),
                origin.actorIp(),
                origin.userAgent(),
                origin.correlationId(),
                "access.denied",
                "request",
                null,
                target.length() <= 200 ? target : target.substring(0, 200),
                null,
                Outcome.DENIED,
                Map.of()));
    }

    /**
     * A security event before an organization is chosen, e.g. {@code auth.signed_in} or {@code auth.sign_in_failed}.
     * No e-mail address is stored: a failed attempt only records where it came from.
     */
    public void security(String action, UUID userId, Outcome outcome) {
        AuditContext.Origin origin = AuditContext.current();
        write(new AuditRecord(
                null,
                now(),
                userId,
                origin.actorIp(),
                origin.userAgent(),
                origin.correlationId(),
                action,
                "session",
                userId,
                null,
                null,
                outcome,
                Map.of()));
    }

    /** Audit is best effort here: failing to record a refusal must not turn a 403 into a 500. */
    private void write(AuditRecord record) {
        try {
            Runnable append = () -> entityManager.unwrap(Session.class).doWork(connection -> {
                try {
                    AuditChain.append(connection, List.of(record));
                } catch (SQLException failure) {
                    throw new IllegalStateException(failure);
                }
            });
            if (record.organizationId() == null) {
                transactions.inSystem(() -> {
                    append.run();
                    return null;
                });
            } else {
                transactions.inOrganization(record.organizationId(), () -> {
                    append.run();
                    return null;
                });
            }
        } catch (RuntimeException failure) {
            LOG.warn("Could not record the audit event {}", record.action(), failure);
        }
    }

    private java.time.Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
