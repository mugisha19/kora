package com.kora.portfolio.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** Related projects managed together for benefits they wouldn't deliver separately (PMI program management). */
@Entity
@Table(name = "programs")
public class Program {

    public enum Status {
        ACTIVE,
        CLOSED
    }

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "portfolio_id", nullable = false, updatable = false)
    private UUID portfolioId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "manager_id", nullable = false)
    private UUID managerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Program() {
        // for JPA
    }

    public static Program create(
            UUID organizationId, UUID portfolioId, String name, String description, UUID managerId, Instant now) {
        Program program = new Program();
        program.id = UUID.randomUUID();
        program.organizationId = Objects.requireNonNull(organizationId);
        program.portfolioId = Objects.requireNonNull(portfolioId);
        program.name = Objects.requireNonNull(name).strip();
        program.description = description;
        program.managerId = Objects.requireNonNull(managerId);
        program.status = Status.ACTIVE;
        program.createdAt = Objects.requireNonNull(now);
        return program;
    }

    public void rename(String newName) {
        this.name = Objects.requireNonNull(newName).strip();
    }

    public void describe(String newDescription) {
        this.description = newDescription;
    }

    public void assignManager(UUID newManagerId) {
        this.managerId = Objects.requireNonNull(newManagerId);
    }

    public void changeStatus(Status newStatus) {
        this.status = Objects.requireNonNull(newStatus);
    }

    public boolean isActive() {
        return status == Status.ACTIVE;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPortfolioId() {
        return portfolioId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public UUID getManagerId() {
        return managerId;
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
