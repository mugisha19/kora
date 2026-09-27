package com.kora.work.adapter.web;

import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import com.kora.work.adapter.web.WorkDtos.BoardColumnResponse;
import com.kora.work.adapter.web.WorkDtos.BoardColumnSettings;
import com.kora.work.adapter.web.WorkDtos.BoardResponse;
import com.kora.work.adapter.web.WorkDtos.CreateTaskCommentRequest;
import com.kora.work.adapter.web.WorkDtos.CreateTaskRequest;
import com.kora.work.adapter.web.WorkDtos.MoveTaskRequest;
import com.kora.work.adapter.web.WorkDtos.TaskCommentResponse;
import com.kora.work.adapter.web.WorkDtos.TaskResponse;
import com.kora.work.adapter.web.WorkDtos.UpdateTaskRequest;
import com.kora.work.application.BoardService;
import com.kora.work.application.TaskSearch;
import com.kora.work.application.TaskService;
import com.kora.work.application.TaskService.Move;
import com.kora.work.application.TaskService.NewTask;
import com.kora.work.application.TaskService.TaskChanges;
import com.kora.work.domain.BoardColumn;
import com.kora.work.domain.Task;
import com.kora.work.domain.TaskComment;
import com.kora.work.domain.TaskStatus;
import com.kora.work.domain.TaskType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Tasks}: tasks, comments and the Kanban board (feature 08). */
@RestController
class TasksController {

    private final TaskService tasks;
    private final BoardService board;
    private final WorkResponses responses;

    TasksController(TaskService tasks, BoardService board, WorkResponses responses) {
        this.tasks = tasks;
        this.board = board;
        this.responses = responses;
    }

    @GetMapping("/api/v1/projects/{projectId}/tasks")
    PageResponse<TaskResponse> list(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "status", required = false) TaskStatus status,
            @RequestParam(name = "assigneeId", required = false) UUID assigneeId,
            @RequestParam(name = "sprintId", required = false) UUID sprintId,
            @RequestParam(name = "type", required = false) TaskType type,
            @RequestParam(name = "label", required = false) @Size(max = 30) String label,
            @RequestParam(name = "q", required = false) @Size(max = 100) String q,
            Pageable pageable) {
        Page<Task> page =
                tasks.list(new TaskSearch(projectId, status, assigneeId, sprintId, type, label, q, false), pageable);
        return PageResponse.from(
                new PageImpl<>(responses.tasks(page.getContent()), page.getPageable(), page.getTotalElements()));
    }

    @PostMapping("/api/v1/projects/{projectId}/tasks")
    ResponseEntity<TaskResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateTaskRequest body) {
        Task task = tasks.create(
                projectId,
                new NewTask(
                        body.title(),
                        body.description(),
                        body.type(),
                        body.priority(),
                        body.status(),
                        body.assigneeId(),
                        body.wbsNodeId(),
                        body.sprintId(),
                        body.storyPoints(),
                        body.estimateHours(),
                        body.remainingHours(),
                        body.startDate(),
                        body.dueDate(),
                        body.labels(),
                        body.durationDays(),
                        body.scheduleConstraint(),
                        body.constraintDate()));
        return ResponseEntity.created(URI.create("/api/v1/tasks/" + task.getId()))
                .eTag(EntityTags.of(task.getVersion()))
                .body(responses.task(task));
    }

    @GetMapping("/api/v1/tasks/{taskId}")
    ResponseEntity<TaskResponse> get(@PathVariable("taskId") UUID taskId) {
        return withTag(tasks.get(taskId));
    }

    @PatchMapping("/api/v1/tasks/{taskId}")
    ResponseEntity<TaskResponse> update(
            @PathVariable("taskId") UUID taskId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateTaskRequest body) {
        return withTag(tasks.update(
                taskId,
                expectedVersion,
                new TaskChanges(
                        body.title(),
                        body.description(),
                        body.type(),
                        body.priority(),
                        body.assigneeId(),
                        body.wbsNodeId(),
                        body.storyPoints(),
                        body.estimateHours(),
                        body.remainingHours(),
                        body.startDate(),
                        body.dueDate(),
                        body.labels(),
                        body.durationDays(),
                        body.scheduleConstraint(),
                        body.constraintDate())));
    }

    @DeleteMapping("/api/v1/tasks/{taskId}")
    ResponseEntity<Void> delete(@PathVariable("taskId") UUID taskId) {
        tasks.delete(taskId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/tasks/{taskId}/move")
    ResponseEntity<TaskResponse> move(@PathVariable("taskId") UUID taskId, @Valid @RequestBody MoveTaskRequest body) {
        return withTag(tasks.move(
                taskId,
                new Move(
                        body.status(),
                        body.afterTaskId(),
                        body.beforeTaskId(),
                        Boolean.TRUE.equals(body.override()),
                        body.reason())));
    }

    @GetMapping("/api/v1/tasks/{taskId}/comments")
    List<TaskCommentResponse> comments(@PathVariable("taskId") UUID taskId) {
        return responses.comments(tasks.comments(taskId));
    }

    @PostMapping("/api/v1/tasks/{taskId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    TaskCommentResponse comment(
            @PathVariable("taskId") UUID taskId, @Valid @RequestBody CreateTaskCommentRequest body) {
        TaskComment comment = tasks.comment(taskId, body.body());
        return responses.comments(List.of(comment)).getFirst();
    }

    @GetMapping("/api/v1/projects/{projectId}/board")
    BoardResponse board(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "sprintId", required = false) UUID sprintId) {
        List<BoardService.Column> columns = board.board(projectId, sprintId);
        List<TaskResponse> cards = responses.tasks(
                columns.stream().flatMap(column -> column.tasks().stream()).toList());
        int next = 0;
        List<BoardColumnResponse> body = new ArrayList<>();
        for (BoardService.Column column : columns) {
            int size = column.tasks().size();
            body.add(new BoardColumnResponse(
                    column.settings().getStatus(),
                    column.settings().getName(),
                    column.settings().getWipLimit(),
                    column.taskCount(),
                    column.atLimit(),
                    cards.subList(next, next + size)));
            next += size;
        }
        return new BoardResponse(projectId, sprintId, body);
    }

    @PutMapping("/api/v1/projects/{projectId}/board/columns/{status}")
    BoardColumnSettings configureColumn(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("status") TaskStatus status,
            @Valid @RequestBody BoardColumnSettings body) {
        BoardColumn column = board.configure(projectId, status, body.name(), body.wipLimit());
        return new BoardColumnSettings(column.getStatus(), column.getName(), column.getWipLimit());
    }

    private ResponseEntity<TaskResponse> withTag(Task task) {
        return ResponseEntity.ok().eTag(EntityTags.of(task.getVersion())).body(responses.task(task));
    }
}
