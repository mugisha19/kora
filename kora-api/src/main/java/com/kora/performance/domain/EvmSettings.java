package com.kora.performance.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** A project's earned value methods; stored once a manager changes them, physical % and typical EAC until then. */
@Entity
@Table(name = "evm_settings")
public class EvmSettings {

    @Id
    @Column(name = "project_id")
    private UUID projectId;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "percent_complete_method", nullable = false)
    private PercentCompleteMethod percentCompleteMethod;

    @Enumerated(EnumType.STRING)
    @Column(name = "eac_method", nullable = false)
    private EacMethod eacMethod;

    @Version
    private Long version;

    protected EvmSettings() {
        // for JPA
    }

    public static EvmSettings standard(UUID organizationId, UUID projectId) {
        EvmSettings settings = new EvmSettings();
        settings.organizationId = organizationId;
        settings.projectId = Objects.requireNonNull(projectId);
        settings.percentCompleteMethod = PercentCompleteMethod.PHYSICAL;
        settings.eacMethod = EacMethod.TYPICAL;
        return settings;
    }

    public void choose(PercentCompleteMethod percentComplete, EacMethod eac) {
        this.percentCompleteMethod = Objects.requireNonNull(percentComplete);
        this.eacMethod = Objects.requireNonNull(eac);
    }

    public UUID getProjectId() {
        return projectId;
    }

    public PercentCompleteMethod getPercentCompleteMethod() {
        return percentCompleteMethod;
    }

    public EacMethod getEacMethod() {
        return eacMethod;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
