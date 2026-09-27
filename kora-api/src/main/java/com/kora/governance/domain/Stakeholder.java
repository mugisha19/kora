package com.kora.governance.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
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

/**
 * Someone affected by the project (feature 13), placed on the power/interest grid with their current and desired
 * engagement. Holds personal data, so removing one erases it ({@link #remove}) rather than deleting the row.
 */
@Entity
@Table(name = "stakeholders")
public class Stakeholder {

    public static final String REMOVED_NAME = "Removed stakeholder";

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(nullable = false)
    private String name;

    /** Their own organization; "affiliation" in the table, so it isn't mistaken for the tenant. */
    @Column(name = "affiliation")
    private String organization;

    private String role;

    private String email;

    private String phone;

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private short power;

    @Column(nullable = false)
    private short interest;

    private Short influence;

    @Enumerated(EnumType.STRING)
    @Column(name = "current_engagement", nullable = false)
    private Engagement currentEngagement;

    @Enumerated(EnumType.STRING)
    @Column(name = "desired_engagement", nullable = false)
    private Engagement desiredEngagement;

    @Column(name = "communication_preferences")
    private String communicationPreferences;

    private String notes;

    @Column(nullable = false)
    private boolean removed;

    @Version
    private Long version;

    protected Stakeholder() {
        // for JPA
    }

    public static Stakeholder identify(
            UUID organizationId,
            UUID projectId,
            String name,
            int power,
            int interest,
            Engagement current,
            Engagement desired) {
        Stakeholder stakeholder = new Stakeholder();
        stakeholder.id = UUID.randomUUID();
        stakeholder.organizationId = Objects.requireNonNull(organizationId);
        stakeholder.projectId = Objects.requireNonNull(projectId);
        stakeholder.rename(name);
        stakeholder.rate(power, interest, null);
        stakeholder.engage(current, desired);
        return stakeholder;
    }

    public void rename(String newName) {
        this.name = Objects.requireNonNull(newName).strip();
    }

    public void describe(String newOrganization, String newRole) {
        if (newOrganization != null) {
            this.organization = newOrganization;
        }
        if (newRole != null) {
            this.role = newRole;
        }
    }

    public void contact(String newEmail, String newPhone, UUID newUserId) {
        if (newEmail != null) {
            this.email = newEmail;
        }
        if (newPhone != null) {
            this.phone = newPhone;
        }
        if (newUserId != null) {
            this.userId = newUserId;
        }
    }

    /** Null parameters keep the current value. */
    public void rate(Integer newPower, Integer newInterest, Integer newInfluence) {
        if (newPower != null) {
            this.power = scale("power", newPower);
        }
        if (newInterest != null) {
            this.interest = scale("interest", newInterest);
        }
        if (newInfluence != null) {
            this.influence = scale("influence", newInfluence);
        }
    }

    public void engage(Engagement current, Engagement desired) {
        if (current != null) {
            this.currentEngagement = current;
        }
        if (desired != null) {
            this.desiredEngagement = desired;
        }
    }

    public void note(String newPreferences, String newNotes) {
        if (newPreferences != null) {
            this.communicationPreferences = newPreferences;
        }
        if (newNotes != null) {
            this.notes = newNotes;
        }
    }

    /**
     * Erases everything that identifies the person (data protection: GDPR, Rwanda law 058/2021) and keeps the
     * anonymous ratings, so the row still makes sense wherever it is referenced.
     */
    public void remove() {
        this.name = REMOVED_NAME;
        this.organization = null;
        this.role = null;
        this.email = null;
        this.phone = null;
        this.userId = null;
        this.communicationPreferences = null;
        this.notes = null;
        this.removed = true;
    }

    public StakeholderQuadrant quadrant() {
        return StakeholderQuadrant.of(power, interest);
    }

    public int engagementGap() {
        return currentEngagement.gapTo(desiredEngagement);
    }

    private static short scale(String field, int value) {
        if (value < 1 || value > 5) {
            throw new InvalidInputException(FieldViolation.of(field, PlatformErrorCodes.Field.RANGE, "must be 1 to 5"));
        }
        return (short) value;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public String getName() {
        return name;
    }

    public String getOrganization() {
        return organization;
    }

    public String getRole() {
        return role;
    }

    public String getEmail() {
        return email;
    }

    public String getPhone() {
        return phone;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getPower() {
        return power;
    }

    public int getInterest() {
        return interest;
    }

    public Integer getInfluence() {
        return influence == null ? null : influence.intValue();
    }

    public Engagement getCurrentEngagement() {
        return currentEngagement;
    }

    public Engagement getDesiredEngagement() {
        return desiredEngagement;
    }

    public String getCommunicationPreferences() {
        return communicationPreferences;
    }

    public String getNotes() {
        return notes;
    }

    public boolean isRemoved() {
        return removed;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
