package com.kora.work.domain;

import com.kora.platform.audit.NotAudited;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * The last task number handed out in a project. It is read with a row lock while a task is created, so two tasks
 * created at the same moment still get different keys.
 *
 * <p>Not audited: a counter; the tasks it numbers are audited.
 */
@NotAudited
@Entity
@Table(name = "task_sequences")
public class TaskSequence {

    @Id
    @Column(name = "project_id")
    private UUID projectId;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "last_number", nullable = false)
    private int lastNumber;

    protected TaskSequence() {
        // for JPA
    }

    public int next() {
        return ++lastNumber;
    }
}
