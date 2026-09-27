package com.kora.schedule.domain;

import com.kora.platform.audit.NotAudited;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * One task's planned dates in a baseline.
 *
 * <p>Not audited: part of a baseline, which is audited as a whole.
 */
@NotAudited
@Entity
@Table(name = "baseline_tasks")
public class BaselineTask {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "baseline_id", nullable = false, updatable = false)
    private UUID baselineId;

    @Column(name = "task_id", nullable = false, updatable = false)
    private UUID taskId;

    @Column(name = "start_date", nullable = false, updatable = false)
    private LocalDate startDate;

    @Column(name = "finish_date", nullable = false, updatable = false)
    private LocalDate finishDate;

    protected BaselineTask() {
        // for JPA
    }

    public static BaselineTask of(Baseline baseline, UUID taskId, LocalDate start, LocalDate finish) {
        BaselineTask task = new BaselineTask();
        task.id = UUID.randomUUID();
        task.organizationId = baseline.getOrganizationId();
        task.baselineId = baseline.getId();
        task.taskId = Objects.requireNonNull(taskId);
        task.startDate = Objects.requireNonNull(start);
        task.finishDate = Objects.requireNonNull(finish);
        return task;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getFinishDate() {
        return finishDate;
    }
}
