package com.kora.work.adapter.web;

import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.platform.web.UserRefJson;
import com.kora.work.adapter.web.WorkDtos.SprintResponse;
import com.kora.work.adapter.web.WorkDtos.TaskCommentResponse;
import com.kora.work.adapter.web.WorkDtos.TaskResponse;
import com.kora.work.application.SprintService.SprintView;
import com.kora.work.domain.Sprint;
import com.kora.work.domain.Task;
import com.kora.work.domain.TaskComment;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Turns tasks, comments and sprints into responses, naming every person on a page in one lookup. */
@Component
class WorkResponses {

    private final MemberDirectory members;
    private final UserAccounts accounts;

    WorkResponses(MemberDirectory members, UserAccounts accounts) {
        this.members = members;
        this.accounts = accounts;
    }

    TaskResponse task(Task task) {
        return tasks(List.of(task)).getFirst();
    }

    List<TaskResponse> tasks(List<Task> tasks) {
        Map<UUID, String> names = names(tasks.stream().map(Task::getAssigneeId).toList());
        return tasks.stream().map(task -> task(task, names)).toList();
    }

    List<TaskCommentResponse> comments(List<TaskComment> comments) {
        Map<UUID, String> names =
                names(comments.stream().map(TaskComment::getAuthorId).toList());
        return comments.stream()
                .map(comment -> new TaskCommentResponse(
                        comment.getId(),
                        new UserRefJson(comment.getAuthorId(), names.get(comment.getAuthorId())),
                        comment.getBody(),
                        comment.getCreatedAt()))
                .toList();
    }

    static SprintResponse sprint(SprintView view) {
        Sprint sprint = view.sprint();
        return new SprintResponse(
                sprint.getId(),
                sprint.getProjectId(),
                sprint.getName(),
                sprint.getGoal(),
                sprint.getStartDate(),
                sprint.getEndDate(),
                sprint.getStatus(),
                view.taskCount(),
                view.totalPoints(),
                sprint.getCommittedPoints(),
                sprint.getCompletedPoints(),
                sprint.getVersion());
    }

    private static TaskResponse task(Task task, Map<UUID, String> names) {
        UUID assigneeId = task.getAssigneeId();
        return new TaskResponse(
                task.getId(),
                task.getKey(),
                task.getProjectId(),
                task.getTitle(),
                task.getDescription(),
                task.getType(),
                task.getPriority(),
                task.getStatus(),
                task.getBlockedReason(),
                assigneeId == null ? null : new UserRefJson(assigneeId, names.get(assigneeId)),
                task.getWbsNodeId(),
                task.getSprintId(),
                task.getStoryPoints(),
                task.getEstimateHours(),
                task.getRemainingHours(),
                task.getStartDate(),
                task.getDueDate(),
                task.getLabels(),
                task.getDurationDays(),
                task.getScheduleConstraint(),
                task.getConstraintDate(),
                task.getRank(),
                task.getCreatedAt(),
                task.getCompletedAt(),
                task.getVersion());
    }

    /**
     * Full names in one query for current members; someone who has left the organization keeps their name on the work
     * and comments they left behind, looked up in their account.
     */
    private Map<UUID, String> names(Collection<UUID> userIds) {
        List<UUID> ids = userIds.stream().filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> names = new HashMap<>();
        members.findAll(ids).forEach((id, member) -> names.put(id, member.fullName()));
        for (UUID id : ids) {
            names.computeIfAbsent(id, missing -> accounts.get(missing).fullName());
        }
        return names;
    }
}
