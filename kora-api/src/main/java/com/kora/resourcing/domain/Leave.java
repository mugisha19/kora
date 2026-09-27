package com.kora.resourcing.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** Days someone is away (feature 16); their working days don't count towards capacity. */
@Entity
@Table(name = "leaves")
public class Leave {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "from_date", nullable = false, updatable = false)
    private LocalDate from;

    @Column(name = "to_date", nullable = false, updatable = false)
    private LocalDate to;

    @Column(updatable = false)
    private String reason;

    protected Leave() {
        // for JPA
    }

    public static Leave of(UUID organizationId, UUID userId, LocalDate from, LocalDate to, String reason) {
        if (to.isBefore(from)) {
            throw new InvalidInputException(
                    FieldViolation.of("to", PlatformErrorCodes.Field.INVALID, "must not be before the first day"));
        }
        Leave leave = new Leave();
        leave.id = UUID.randomUUID();
        leave.organizationId = Objects.requireNonNull(organizationId);
        leave.userId = Objects.requireNonNull(userId);
        leave.from = from;
        leave.to = to;
        leave.reason = reason;
        return leave;
    }

    public boolean covers(LocalDate day) {
        return !day.isBefore(from) && !day.isAfter(to);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getFrom() {
        return from;
    }

    public LocalDate getTo() {
        return to;
    }

    public String getReason() {
        return reason;
    }
}
