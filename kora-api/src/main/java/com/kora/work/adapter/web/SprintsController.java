package com.kora.work.adapter.web;

import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import com.kora.work.adapter.web.WorkDtos.BurndownDayResponse;
import com.kora.work.adapter.web.WorkDtos.BurndownResponse;
import com.kora.work.adapter.web.WorkDtos.CloseSprintRequest;
import com.kora.work.adapter.web.WorkDtos.CreateSprintRequest;
import com.kora.work.adapter.web.WorkDtos.SprintResponse;
import com.kora.work.adapter.web.WorkDtos.SprintTasksRequest;
import com.kora.work.adapter.web.WorkDtos.TaskResponse;
import com.kora.work.adapter.web.WorkDtos.UpdateSprintRequest;
import com.kora.work.adapter.web.WorkDtos.VelocityResponse;
import com.kora.work.adapter.web.WorkDtos.VelocitySprintResponse;
import com.kora.work.application.SprintService;
import com.kora.work.application.SprintService.NewSprint;
import com.kora.work.application.SprintService.SprintChanges;
import com.kora.work.application.SprintService.SprintView;
import com.kora.work.domain.Burndown;
import com.kora.work.domain.Task;
import com.kora.work.domain.Velocity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Sprints}: the backlog, sprints, burndown and velocity (feature 09). */
@RestController
class SprintsController {

    private final SprintService sprints;
    private final WorkResponses responses;

    SprintsController(SprintService sprints, WorkResponses responses) {
        this.sprints = sprints;
        this.responses = responses;
    }

    @GetMapping("/api/v1/projects/{projectId}/backlog")
    PageResponse<TaskResponse> backlog(@PathVariable("projectId") UUID projectId, Pageable pageable) {
        Page<Task> page = sprints.backlog(projectId, pageable);
        return PageResponse.from(
                new PageImpl<>(responses.tasks(page.getContent()), page.getPageable(), page.getTotalElements()));
    }

    @GetMapping("/api/v1/projects/{projectId}/sprints")
    List<SprintResponse> list(@PathVariable("projectId") UUID projectId) {
        return sprints.list(projectId).stream().map(WorkResponses::sprint).toList();
    }

    @PostMapping("/api/v1/projects/{projectId}/sprints")
    ResponseEntity<SprintResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateSprintRequest body) {
        SprintView view =
                sprints.create(projectId, new NewSprint(body.name(), body.goal(), body.startDate(), body.endDate()));
        return ResponseEntity.created(
                        URI.create("/api/v1/sprints/" + view.sprint().getId()))
                .eTag(EntityTags.of(view.sprint().getVersion()))
                .body(WorkResponses.sprint(view));
    }

    @GetMapping("/api/v1/sprints/{sprintId}")
    ResponseEntity<SprintResponse> get(@PathVariable("sprintId") UUID sprintId) {
        return withTag(sprints.get(sprintId));
    }

    @PatchMapping("/api/v1/sprints/{sprintId}")
    ResponseEntity<SprintResponse> update(
            @PathVariable("sprintId") UUID sprintId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateSprintRequest body) {
        return withTag(sprints.update(
                sprintId,
                expectedVersion,
                new SprintChanges(body.name(), body.goal(), body.startDate(), body.endDate())));
    }

    @PostMapping("/api/v1/sprints/{sprintId}/start")
    ResponseEntity<SprintResponse> start(@PathVariable("sprintId") UUID sprintId) {
        return withTag(sprints.start(sprintId));
    }

    @PostMapping("/api/v1/sprints/{sprintId}/close")
    ResponseEntity<SprintResponse> close(
            @PathVariable("sprintId") UUID sprintId, @Valid @RequestBody CloseSprintRequest body) {
        return withTag(sprints.close(sprintId, body.carryOverTo()));
    }

    @PostMapping("/api/v1/sprints/{sprintId}/tasks")
    ResponseEntity<SprintResponse> addTasks(
            @PathVariable("sprintId") UUID sprintId, @Valid @RequestBody SprintTasksRequest body) {
        return withTag(sprints.addTasks(sprintId, body.taskIds()));
    }

    @DeleteMapping("/api/v1/sprints/{sprintId}/tasks/{taskId}")
    ResponseEntity<Void> removeTask(@PathVariable("sprintId") UUID sprintId, @PathVariable("taskId") UUID taskId) {
        sprints.removeTask(sprintId, taskId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/sprints/{sprintId}/burndown")
    BurndownResponse burndown(@PathVariable("sprintId") UUID sprintId) {
        SprintView sprint = sprints.get(sprintId);
        Burndown burndown = sprints.burndown(sprintId);
        return new BurndownResponse(
                sprintId,
                sprint.sprint().getStartDate(),
                sprint.sprint().getEndDate(),
                burndown.committedPoints(),
                burndown.days().stream()
                        .map(day -> new BurndownDayResponse(day.date(), day.idealRemaining(), day.actualRemaining()))
                        .toList());
    }

    @GetMapping("/api/v1/projects/{projectId}/velocity")
    VelocityResponse velocity(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "last", defaultValue = "6") @Min(1) @Max(20) int last) {
        Velocity velocity = sprints.velocity(projectId, last);
        return new VelocityResponse(
                velocity.sprints().stream()
                        .map(sprint -> new VelocitySprintResponse(
                                sprint.getId(),
                                sprint.getName(),
                                sprint.getEndDate(),
                                orZero(sprint.getCommittedPoints()),
                                orZero(sprint.getCompletedPoints())))
                        .toList(),
                velocity.average(),
                velocity.low(),
                velocity.high());
    }

    private static int orZero(Integer points) {
        return points == null ? 0 : points;
    }

    private static ResponseEntity<SprintResponse> withTag(SprintView view) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(view.sprint().getVersion()))
                .body(WorkResponses.sprint(view));
    }
}
