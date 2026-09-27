package com.kora.work.application;

import com.kora.organization.CurrentMember;
import com.kora.platform.error.NotFoundException;
import com.kora.portfolio.ProjectAccess;
import com.kora.work.domain.BoardColumn;
import com.kora.work.domain.Task;
import com.kora.work.domain.TaskStatus;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Kanban board (feature 08): one column per status after the backlog, cards in rank order. WIP counts are
 * project-wide, the same numbers the move check uses, even when the board shows only one sprint's cards.
 */
@Service
public class BoardService {

    private final TaskRepository tasks;
    private final BoardColumnRepository columns;
    private final SprintRepository sprints;
    private final ProjectAccess projects;

    BoardService(
            TaskRepository tasks, BoardColumnRepository columns, SprintRepository sprints, ProjectAccess projects) {
        this.tasks = tasks;
        this.columns = columns;
        this.sprints = sprints;
        this.projects = projects;
    }

    public record Column(BoardColumn settings, long taskCount, boolean atLimit, List<Task> tasks) {}

    @Transactional(readOnly = true)
    public List<Column> board(UUID projectId, UUID sprintId) {
        projects.readable(projectId);
        if (sprintId != null
                && sprints.findById(sprintId)
                        .filter(sprint -> sprint.getProjectId().equals(projectId))
                        .isEmpty()) {
            throw NotFoundException.of("Sprint", sprintId);
        }
        Map<TaskStatus, BoardColumn> settings = settings(projectId);
        Map<TaskStatus, Long> counts = tasks.countByStatus(projectId).stream()
                .collect(Collectors.toMap(StatusCount::status, StatusCount::tasks));
        Map<TaskStatus, List<Task>> cards = tasks
                .search(
                        new TaskSearch(projectId, null, null, sprintId, null, null, null, false),
                        Sort.by("rank", "createdAt"))
                .stream()
                .filter(task -> task.getStatus().isOnBoard())
                .collect(Collectors.groupingBy(Task::getStatus));
        List<Column> board = new ArrayList<>();
        for (TaskStatus status : TaskStatus.BOARD) {
            BoardColumn column = settings.get(status);
            long count = counts.getOrDefault(status, 0L);
            board.add(new Column(column, count, column.isFullWith(count), cards.getOrDefault(status, List.of())));
        }
        return board;
    }

    @Transactional
    public BoardColumn configure(UUID projectId, TaskStatus status, String name, Integer wipLimit) {
        projects.manageable(projectId);
        BoardColumn column = columns.findByProjectIdAndStatus(projectId, status)
                .orElseGet(() -> BoardColumn.defaults(CurrentMember.get().organizationId(), projectId, status));
        column.configure(name, wipLimit);
        return columns.save(column);
    }

    private Map<TaskStatus, BoardColumn> settings(UUID projectId) {
        Map<TaskStatus, BoardColumn> configured = columns.findByProjectId(projectId).stream()
                .collect(Collectors.toMap(BoardColumn::getStatus, Function.identity()));
        Map<TaskStatus, BoardColumn> all = new EnumMap<>(TaskStatus.class);
        for (TaskStatus status : TaskStatus.BOARD) {
            all.put(status, configured.getOrDefault(status, BoardColumn.defaults(null, projectId, status)));
        }
        return all;
    }
}
