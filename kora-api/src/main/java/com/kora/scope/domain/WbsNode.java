package com.kora.scope.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.OptimisticLock;
import org.hibernate.annotations.TenantId;

/**
 * One row of the work breakdown structure. Its code ({@code 1.2.3}) is not stored: it follows from the position in the
 * tree ({@link WbsTree}), so moving a node renumbers the tree without rewriting codes.
 */
@Entity
@Table(name = "wbs_nodes")
public class WbsNode {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    /**
     * Where the node sits is excluded from optimistic locking: moving a sibling shifts positions, and that must not
     * make someone's concurrent rename fail with 412.
     */
    @OptimisticLock(excluded = true)
    @Column(name = "parent_id")
    private UUID parentId;

    @OptimisticLock(excluded = true)
    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private String name;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WbsNodeType type;

    @Column(name = "owner_id")
    private UUID ownerId;

    @Column(name = "planned_effort_hours", nullable = false)
    private BigDecimal plannedEffortHours;

    @Column(name = "planned_cost_amount", nullable = false)
    private BigDecimal plannedCostAmount;

    @Column(name = "cost_currency", nullable = false, updatable = false)
    private String costCurrency;

    @Column(name = "percent_complete", nullable = false)
    private BigDecimal percentComplete;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected WbsNode() {
        // for JPA
    }

    public static WbsNode create(
            UUID organizationId,
            UUID projectId,
            UUID parentId,
            int position,
            String name,
            String description,
            WbsNodeType type,
            UUID ownerId,
            String currency,
            Instant now) {
        WbsNode node = new WbsNode();
        node.id = UUID.randomUUID();
        node.organizationId = Objects.requireNonNull(organizationId);
        node.projectId = Objects.requireNonNull(projectId);
        node.parentId = parentId;
        node.position = position;
        node.rename(name);
        node.description = description;
        node.type = Objects.requireNonNull(type);
        node.ownerId = ownerId;
        node.costCurrency = Objects.requireNonNull(currency);
        node.plannedEffortHours = BigDecimal.ZERO;
        node.plannedCostAmount = BigDecimal.ZERO;
        node.percentComplete = BigDecimal.ZERO;
        node.createdAt = Objects.requireNonNull(now);
        return node;
    }

    public void rename(String newName) {
        this.name = Objects.requireNonNull(newName).strip();
    }

    public void describe(String newDescription) {
        this.description = newDescription;
    }

    public void assignOwner(UUID newOwnerId) {
        this.ownerId = newOwnerId;
    }

    /** Only the tree knows whether the node has children, so it checks before calling this. */
    void changeType(WbsNodeType newType) {
        if (newType == WbsNodeType.DELIVERABLE) {
            // A deliverable's figures come from its children; stale own figures would be misleading.
            this.plannedEffortHours = BigDecimal.ZERO;
            this.plannedCostAmount = BigDecimal.ZERO;
            this.percentComplete = BigDecimal.ZERO;
        }
        this.type = newType;
    }

    /**
     * Effort, cost and progress belong to work packages.
     *
     * @throws InvalidInputException naming the field when set on a deliverable
     */
    public void plan(BigDecimal effortHours, Money cost, BigDecimal percent) {
        if (type == WbsNodeType.DELIVERABLE) {
            String field =
                    effortHours != null ? "plannedEffortHours" : cost != null ? "plannedCost" : "percentComplete";
            throw new InvalidInputException(FieldViolation.of(
                    field, PlatformErrorCodes.Field.INVALID, "is rolled up from the children of a deliverable"));
        }
        if (effortHours != null) {
            this.plannedEffortHours = effortHours.setScale(2, RoundingMode.HALF_EVEN);
        }
        if (cost != null) {
            if (cost.isNegative()) {
                throw new InvalidInputException(
                        FieldViolation.of("plannedCost", PlatformErrorCodes.Field.RANGE, "must not be negative"));
            }
            this.plannedCostAmount = cost.amount();
        }
        if (percent != null) {
            if (percent.signum() < 0 || percent.compareTo(HUNDRED) > 0) {
                throw new InvalidInputException(new FieldViolation(
                        "percentComplete",
                        PlatformErrorCodes.Field.RANGE,
                        "must be between 0 and 100",
                        Map.of("min", 0, "max", 100)));
            }
            this.percentComplete = percent.setScale(2, RoundingMode.HALF_EVEN);
        }
    }

    void placeUnder(UUID newParentId, int newPosition) {
        this.parentId = newParentId;
        this.position = newPosition;
    }

    void reposition(int newPosition) {
        this.position = newPosition;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getParentId() {
        return parentId;
    }

    public int getPosition() {
        return position;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public WbsNodeType getType() {
        return type;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public BigDecimal getPlannedEffortHours() {
        return plannedEffortHours;
    }

    public Money getPlannedCost() {
        return new Money(plannedCostAmount, costCurrency);
    }

    public BigDecimal getPercentComplete() {
        return percentComplete;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
