package com.kora.governance.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** One scoring of a risk, kept for its history (sparkline, audits); never changed. */
@Entity
@Table(name = "risk_assessments")
public class RiskAssessment {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "risk_id", nullable = false, updatable = false)
    private UUID riskId;

    @Column(nullable = false, updatable = false)
    private short probability;

    @Column(nullable = false, updatable = false)
    private short impact;

    @Column(name = "residual_probability", updatable = false)
    private Short residualProbability;

    @Column(name = "residual_impact", updatable = false)
    private Short residualImpact;

    @Column(updatable = false)
    private String note;

    @Column(name = "assessed_by", nullable = false, updatable = false)
    private UUID assessedBy;

    @Column(name = "assessed_at", nullable = false, updatable = false)
    private Instant assessedAt;

    protected RiskAssessment() {
        // for JPA
    }

    /** Records the risk's scores as they are now. */
    public static RiskAssessment of(Risk risk, String note, UUID assessedBy, Instant now) {
        RiskAssessment assessment = new RiskAssessment();
        assessment.id = UUID.randomUUID();
        assessment.organizationId = risk.getOrganizationId();
        assessment.riskId = risk.getId();
        assessment.probability = (short) risk.getProbability();
        assessment.impact = (short) risk.getImpact();
        assessment.residualProbability = risk.getResidualProbability() == null
                ? null
                : risk.getResidualProbability().shortValue();
        assessment.residualImpact = risk.getResidualImpact() == null
                ? null
                : risk.getResidualImpact().shortValue();
        assessment.note = note;
        assessment.assessedBy = Objects.requireNonNull(assessedBy);
        assessment.assessedAt = Objects.requireNonNull(now);
        return assessment;
    }

    public UUID getId() {
        return id;
    }

    public int getProbability() {
        return probability;
    }

    public int getImpact() {
        return impact;
    }

    public int score() {
        return probability * impact;
    }

    public Integer getResidualProbability() {
        return residualProbability == null ? null : residualProbability.intValue();
    }

    public Integer getResidualImpact() {
        return residualImpact == null ? null : residualImpact.intValue();
    }

    public String getNote() {
        return note;
    }

    public UUID getAssessedBy() {
        return assessedBy;
    }

    public Instant getAssessedAt() {
        return assessedAt;
    }
}
