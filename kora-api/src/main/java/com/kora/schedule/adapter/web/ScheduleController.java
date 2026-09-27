package com.kora.schedule.adapter.web;

import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.platform.web.UserRefJson;
import com.kora.schedule.application.DependencyService;
import com.kora.schedule.application.ProjectSchedule;
import com.kora.schedule.application.ScheduleService;
import com.kora.schedule.domain.Baseline;
import com.kora.schedule.domain.Dependency;
import com.kora.schedule.domain.DependencyType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Schedule}: dependencies, the computed schedule and baselines (feature 10). */
@RestController
class ScheduleController {

    private final DependencyService dependencies;
    private final ScheduleService schedules;
    private final MemberDirectory members;
    private final UserAccounts accounts;

    ScheduleController(
            DependencyService dependencies, ScheduleService schedules, MemberDirectory members, UserAccounts accounts) {
        this.dependencies = dependencies;
        this.schedules = schedules;
        this.members = members;
        this.accounts = accounts;
    }

    record DependencyResponse(
            UUID id,
            UUID projectId,
            UUID predecessorId,
            UUID successorId,
            DependencyType type,
            int lagDays,
            Instant createdAt) {}

    record CreateDependencyRequest(
            @NotNull UUID predecessorId,
            @NotNull UUID successorId,
            DependencyType type,
            @Min(-365) @Max(365) Integer lagDays) {}

    record ScheduledTaskResponse(
            UUID taskId,
            String key,
            String title,
            String status,
            int durationDays,
            LocalDate earlyStart,
            LocalDate earlyFinish,
            LocalDate lateStart,
            LocalDate lateFinish,
            int totalFloat,
            int freeFloat,
            boolean critical,
            LocalDate baselineStart,
            LocalDate baselineFinish,
            Integer startVariance,
            Integer finishVariance) {}

    record BaselineResponse(int number, Instant savedAt, UserRefJson savedBy, int taskCount) {}

    record ScheduleResponse(
            UUID projectId,
            LocalDate projectStart,
            LocalDate projectFinish,
            BaselineResponse baseline,
            List<UUID> criticalPath,
            List<ScheduledTaskResponse> tasks) {}

    @GetMapping("/api/v1/projects/{projectId}/dependencies")
    List<DependencyResponse> list(@PathVariable("projectId") UUID projectId) {
        return dependencies.list(projectId).stream()
                .map(ScheduleController::dependency)
                .toList();
    }

    @PostMapping("/api/v1/projects/{projectId}/dependencies")
    ResponseEntity<DependencyResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateDependencyRequest body) {
        Dependency dependency = dependencies.create(
                projectId,
                body.predecessorId(),
                body.successorId(),
                body.type() == null ? DependencyType.FS : body.type(),
                body.lagDays() == null ? 0 : body.lagDays());
        return ResponseEntity.created(URI.create("/api/v1/dependencies/" + dependency.getId()))
                .body(dependency(dependency));
    }

    @DeleteMapping("/api/v1/dependencies/{dependencyId}")
    ResponseEntity<Void> delete(@PathVariable("dependencyId") UUID dependencyId) {
        dependencies.delete(dependencyId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/projects/{projectId}/schedule")
    ScheduleResponse schedule(@PathVariable("projectId") UUID projectId) {
        ProjectSchedule schedule = schedules.schedule(projectId);
        return new ScheduleResponse(
                schedule.projectId(),
                schedule.projectStart(),
                schedule.projectFinish(),
                schedule.baseline() == null ? null : baseline(schedule.baseline()),
                schedule.criticalPath(),
                schedule.tasks().stream().map(ScheduleController::task).toList());
    }

    @PostMapping("/api/v1/projects/{projectId}/schedule/baseline")
    @ResponseStatus(HttpStatus.CREATED)
    BaselineResponse saveBaseline(@PathVariable("projectId") UUID projectId) {
        return baseline(schedules.saveBaseline(projectId));
    }

    private BaselineResponse baseline(Baseline baseline) {
        UUID savedBy = baseline.getSavedBy();
        String name = members.find(savedBy)
                .map(MemberSummary::fullName)
                .orElseGet(() -> accounts.get(savedBy).fullName());
        return new BaselineResponse(
                baseline.getNumber(), baseline.getSavedAt(), new UserRefJson(savedBy, name), baseline.getTaskCount());
    }

    private static DependencyResponse dependency(Dependency dependency) {
        return new DependencyResponse(
                dependency.getId(),
                dependency.getProjectId(),
                dependency.getPredecessorId(),
                dependency.getSuccessorId(),
                dependency.getType(),
                dependency.getLagDays(),
                dependency.getCreatedAt());
    }

    private static ScheduledTaskResponse task(ProjectSchedule.Row row) {
        return new ScheduledTaskResponse(
                row.task().id(),
                row.task().key(),
                row.task().title(),
                row.task().status(),
                row.durationDays(),
                row.earlyStart(),
                row.earlyFinish(),
                row.lateStart(),
                row.lateFinish(),
                row.totalFloat(),
                row.freeFloat(),
                row.critical(),
                row.baselineStart(),
                row.baselineFinish(),
                row.startVariance(),
                row.finishVariance());
    }
}
