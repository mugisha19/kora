package com.kora.portfolio.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/** Someone on a project team besides its manager; team members can see the project. */
@Entity
@Table(name = "project_members")
public class ProjectMember {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "project_role", nullable = false)
    private ProjectRole projectRole;

    @Column(name = "added_at", nullable = false, updatable = false)
    private Instant addedAt;

    protected ProjectMember() {
        // for JPA
    }

    public static ProjectMember add(UUID organizationId, UUID projectId, UUID userId, ProjectRole role, Instant now) {
        ProjectMember member = new ProjectMember();
        member.id = UUID.randomUUID();
        member.organizationId = Objects.requireNonNull(organizationId);
        member.projectId = Objects.requireNonNull(projectId);
        member.userId = Objects.requireNonNull(userId);
        member.changeRole(role);
        member.addedAt = Objects.requireNonNull(now);
        return member;
    }

    public void changeRole(ProjectRole newRole) {
        if (newRole == ProjectRole.MANAGER) {
            throw new IllegalArgumentException("The manager is set on the project, not as a team member");
        }
        this.projectRole = Objects.requireNonNull(newRole);
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getUserId() {
        return userId;
    }

    public ProjectRole getProjectRole() {
        return projectRole;
    }

    public Instant getAddedAt() {
        return addedAt;
    }
}
