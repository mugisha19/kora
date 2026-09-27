package com.kora.governance.domain;

import com.kora.governance.domain.ApprovalHandler.Thresholds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * The organization's change-control thresholds (feature 14): above them, a change needs the PMO or the sponsor.
 * Stored only once an administrator changes them; {@link #standard} is 5% / 10 working days / 15%.
 */
@Entity
@Table(name = "change_control_settings")
public class ChangeControlSettings {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "pmo_cost_percent", nullable = false)
    private BigDecimal pmoCostPercent;

    @Column(name = "pmo_schedule_days", nullable = false)
    private int pmoScheduleDays;

    @Column(name = "sponsor_cost_percent", nullable = false)
    private BigDecimal sponsorCostPercent;

    @Version
    private Long version;

    protected ChangeControlSettings() {
        // for JPA
    }

    public static ChangeControlSettings standard(UUID organizationId) {
        ChangeControlSettings settings = new ChangeControlSettings();
        settings.id = UUID.randomUUID();
        settings.organizationId = organizationId;
        settings.pmoCostPercent = new BigDecimal("5.00");
        settings.pmoScheduleDays = 10;
        settings.sponsorCostPercent = new BigDecimal("15.00");
        return settings;
    }

    public void change(BigDecimal pmoCost, int pmoDays, BigDecimal sponsorCost) {
        this.pmoCostPercent = Objects.requireNonNull(pmoCost).setScale(2, RoundingMode.HALF_EVEN);
        this.pmoScheduleDays = pmoDays;
        this.sponsorCostPercent = Objects.requireNonNull(sponsorCost).setScale(2, RoundingMode.HALF_EVEN);
    }

    public Thresholds thresholds() {
        return new Thresholds(pmoCostPercent, pmoScheduleDays, sponsorCostPercent);
    }

    public BigDecimal getPmoCostPercent() {
        return pmoCostPercent;
    }

    public int getPmoScheduleDays() {
        return pmoScheduleDays;
    }

    public BigDecimal getSponsorCostPercent() {
        return sponsorCostPercent;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
