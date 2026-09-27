package com.kora.work.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** A comment on a task; Markdown like the description. Comments are never edited, so there is no version. */
@Entity
@Table(name = "task_comments")
public class TaskComment {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "task_id", nullable = false, updatable = false)
    private UUID taskId;

    @Column(name = "author_id", nullable = false, updatable = false)
    private UUID authorId;

    @Column(nullable = false, updatable = false)
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected TaskComment() {
        // for JPA
    }

    public static TaskComment write(UUID organizationId, UUID taskId, UUID authorId, String body, Instant now) {
        TaskComment comment = new TaskComment();
        comment.id = UUID.randomUUID();
        comment.organizationId = Objects.requireNonNull(organizationId);
        comment.taskId = Objects.requireNonNull(taskId);
        comment.authorId = Objects.requireNonNull(authorId);
        comment.body = Objects.requireNonNull(body).strip();
        comment.createdAt = Objects.requireNonNull(now);
        return comment;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public UUID getAuthorId() {
        return authorId;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
