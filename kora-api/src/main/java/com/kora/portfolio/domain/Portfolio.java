package com.kora.portfolio.domain;

import com.kora.platform.error.ConflictException;
import com.kora.platform.persistence.StringListConverter;
import com.kora.portfolio.PortfolioErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A portfolio groups programs and projects to achieve strategic objectives (PMI Standard for Portfolio
 * Management). Archiving freezes it and everything in it.
 */
@Entity
@Table(name = "portfolios")
public class Portfolio {

    public enum Status {
        ACTIVE,
        ARCHIVED
    }

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Convert(converter = StringListConverter.class)
    @Column(name = "strategic_objectives", nullable = false)
    private List<String> strategicObjectives;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Portfolio() {
        // for JPA
    }

    public static Portfolio create(
            UUID organizationId,
            String name,
            String description,
            List<String> strategicObjectives,
            UUID ownerId,
            Instant now) {
        Portfolio portfolio = new Portfolio();
        portfolio.id = UUID.randomUUID();
        portfolio.organizationId = Objects.requireNonNull(organizationId);
        portfolio.name = Objects.requireNonNull(name).strip();
        portfolio.description = description;
        portfolio.strategicObjectives = List.copyOf(strategicObjectives == null ? List.of() : strategicObjectives);
        portfolio.ownerId = Objects.requireNonNull(ownerId);
        portfolio.status = Status.ACTIVE;
        portfolio.createdAt = Objects.requireNonNull(now);
        return portfolio;
    }

    /** @throws ConflictException {@code portfolios.archived} while archived */
    public void ensureActive() {
        if (status == Status.ARCHIVED) {
            throw new ConflictException(
                    PortfolioErrorCodes.PORTFOLIO_ARCHIVED, "The portfolio is archived; reactivate it first");
        }
    }

    public void rename(String newName) {
        this.name = Objects.requireNonNull(newName).strip();
    }

    public void describe(String newDescription) {
        this.description = newDescription;
    }

    public void setStrategicObjectives(List<String> objectives) {
        this.strategicObjectives = List.copyOf(objectives);
    }

    public void assignOwner(UUID newOwnerId) {
        this.ownerId = Objects.requireNonNull(newOwnerId);
    }

    public void archive() {
        this.status = Status.ARCHIVED;
    }

    public void reactivate() {
        this.status = Status.ACTIVE;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public List<String> getStrategicObjectives() {
        return strategicObjectives;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
