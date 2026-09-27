package com.kora.work.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A board column's settings. Only configured columns are stored; {@link #defaults} gives the others. A WIP limit
 * makes a bottleneck visible: moving a card into a full column needs an explicit override (feature 08).
 */
@Entity
@Table(name = "board_columns")
public class BoardColumn {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private TaskStatus status;

    @Column(nullable = false)
    private String name;

    @Column(name = "wip_limit")
    private Integer wipLimit;

    protected BoardColumn() {
        // for JPA
    }

    /** A column nobody configured yet: its default name and no WIP limit (not saved). */
    public static BoardColumn defaults(UUID organizationId, UUID projectId, TaskStatus status) {
        if (!status.isOnBoard()) {
            throw new InvalidInputException(
                    FieldViolation.of("status", PlatformErrorCodes.Field.INVALID, "the backlog is not a board column"));
        }
        BoardColumn column = new BoardColumn();
        column.id = UUID.randomUUID();
        column.organizationId = organizationId;
        column.projectId = Objects.requireNonNull(projectId);
        column.status = status;
        column.name = defaultName(status);
        return column;
    }

    public static String defaultName(TaskStatus status) {
        return switch (status) {
            case BACKLOG -> "Backlog";
            case TODO -> "To do";
            case IN_PROGRESS -> "In progress";
            case BLOCKED -> "Blocked";
            case IN_REVIEW -> "In review";
            case DONE -> "Done";
        };
    }

    public void configure(String newName, Integer newWipLimit) {
        this.name = Objects.requireNonNull(newName).strip();
        this.wipLimit = newWipLimit;
    }

    /** Whether {@code taskCount} cards fill the column; a column without a limit is never full. */
    public boolean isFullWith(long taskCount) {
        return wipLimit != null && taskCount >= wipLimit;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public String getName() {
        return name;
    }

    public Integer getWipLimit() {
        return wipLimit;
    }
}
