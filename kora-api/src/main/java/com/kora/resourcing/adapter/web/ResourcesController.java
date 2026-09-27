package com.kora.resourcing.adapter.web;

import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.platform.web.UserRefJson;
import com.kora.resourcing.application.AllocationService;
import com.kora.resourcing.application.AllocationService.AllocationInput;
import com.kora.resourcing.application.PeopleAndRates;
import com.kora.resourcing.application.PeopleAndRates.Capacity;
import com.kora.resourcing.application.ResourceHeatmapService;
import com.kora.resourcing.application.ResourceHeatmapService.Heatmap;
import com.kora.resourcing.domain.Allocation;
import com.kora.resourcing.domain.Leave;
import com.kora.resourcing.domain.UtilizationBand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Resources} (feature 16). */
@RestController
class ResourcesController {

    private final ResourceHeatmapService heatmap;
    private final AllocationService allocations;
    private final PeopleAndRates people;
    private final MemberDirectory members;
    private final UserAccounts accounts;

    ResourcesController(
            ResourceHeatmapService heatmap,
            AllocationService allocations,
            PeopleAndRates people,
            MemberDirectory members,
            UserAccounts accounts) {
        this.heatmap = heatmap;
        this.allocations = allocations;
        this.people = people;
        this.members = members;
        this.accounts = accounts;
    }

    record ResourceWeekResponse(
            LocalDate weekStart,
            BigDecimal capacityHours,
            BigDecimal allocatedHours,
            BigDecimal actualHours,
            BigDecimal utilization,
            UtilizationBand band) {}

    record ResourceRowResponse(UserRefJson user, List<ResourceWeekResponse> weeks) {}

    record ResourceHeatmapResponse(LocalDate from, LocalDate to, List<ResourceRowResponse> people) {}

    record AllocationResponse(UserRefJson user, UUID projectId, LocalDate weekStart, BigDecimal hours) {}

    record AllocationJson(
            @NotNull UUID userId,
            @NotNull LocalDate weekStart,
            @NotNull @DecimalMin("0") @DecimalMax("168") BigDecimal hours) {}

    record AllocationsRequest(@NotNull @Size(max = 500) List<@Valid @NotNull AllocationJson> allocations) {}

    record CapacityPeriodResponse(BigDecimal hoursPerWeek, LocalDate validFrom) {}

    record LeaveResponse(UUID id, UUID userId, LocalDate from, LocalDate to, String reason) {}

    record CapacityResponse(
            UUID userId, BigDecimal hoursPerWeek, List<CapacityPeriodResponse> history, List<LeaveResponse> leave) {}

    record UpdateCapacityRequest(
            @NotNull @DecimalMin("0") @DecimalMax("80") BigDecimal hoursPerWeek,
            @NotNull LocalDate validFrom) {}

    record CreateLeaveRequest(
            @NotNull LocalDate from,
            @NotNull LocalDate to,
            @Size(max = 200) String reason) {}

    @GetMapping("/api/v1/resources/heatmap")
    ResourceHeatmapResponse heatmap(
            @RequestParam(name = "from", required = false) LocalDate from,
            @RequestParam(name = "to", required = false) LocalDate to,
            @RequestParam(name = "projectId", required = false) UUID projectId) {
        Heatmap map = heatmap.heatmap(from, to, projectId);
        return new ResourceHeatmapResponse(
                map.from(),
                map.to(),
                map.people().stream()
                        .map(row -> new ResourceRowResponse(
                                new UserRefJson(
                                        row.person().userId(), row.person().fullName()),
                                row.weeks().stream()
                                        .map(week -> new ResourceWeekResponse(
                                                week.weekStart(),
                                                week.capacityHours(),
                                                week.allocatedHours(),
                                                week.actualHours(),
                                                week.utilization(),
                                                week.band()))
                                        .toList()))
                        .toList());
    }

    @GetMapping("/api/v1/projects/{projectId}/allocations")
    List<AllocationResponse> allocations(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "from", required = false) LocalDate from,
            @RequestParam(name = "to", required = false) LocalDate to) {
        return responses(allocations.list(projectId, from, to));
    }

    @PutMapping("/api/v1/projects/{projectId}/allocations")
    List<AllocationResponse> saveAllocations(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody AllocationsRequest body) {
        return responses(allocations.save(
                projectId,
                body.allocations().stream()
                        .map(input -> new AllocationInput(input.userId(), input.weekStart(), input.hours()))
                        .toList()));
    }

    @GetMapping("/api/v1/users/{userId}/capacity")
    CapacityResponse capacity(@PathVariable("userId") UUID userId) {
        return capacity(people.capacity(userId));
    }

    @PutMapping("/api/v1/users/{userId}/capacity")
    CapacityResponse changeCapacity(
            @PathVariable("userId") UUID userId, @Valid @RequestBody UpdateCapacityRequest body) {
        return capacity(people.changeCapacity(userId, body.hoursPerWeek(), body.validFrom()));
    }

    @PostMapping("/api/v1/users/{userId}/leave")
    @ResponseStatus(HttpStatus.CREATED)
    LeaveResponse addLeave(@PathVariable("userId") UUID userId, @Valid @RequestBody CreateLeaveRequest body) {
        return leave(people.addLeave(userId, body.from(), body.to(), body.reason()));
    }

    @DeleteMapping("/api/v1/leave/{leaveId}")
    ResponseEntity<Void> deleteLeave(@PathVariable("leaveId") UUID leaveId) {
        people.deleteLeave(leaveId);
        return ResponseEntity.noContent().build();
    }

    private static CapacityResponse capacity(Capacity capacity) {
        return new CapacityResponse(
                capacity.userId(),
                capacity.hoursPerWeek(),
                capacity.history().stream()
                        .map(period -> new CapacityPeriodResponse(period.getHoursPerWeek(), period.getValidFrom()))
                        .toList(),
                capacity.leave().stream().map(ResourcesController::leave).toList());
    }

    private static LeaveResponse leave(Leave leave) {
        return new LeaveResponse(leave.getId(), leave.getUserId(), leave.getFrom(), leave.getTo(), leave.getReason());
    }

    private List<AllocationResponse> responses(List<Allocation> list) {
        Map<UUID, String> names = new HashMap<>();
        List<UUID> ids = list.stream().map(Allocation::getUserId).distinct().toList();
        members.findAll(ids).forEach((id, member) -> names.put(id, member.fullName()));
        ids.forEach(
                id -> names.computeIfAbsent(id, missing -> accounts.get(missing).fullName()));
        return list.stream()
                .map(allocation -> new AllocationResponse(
                        new UserRefJson(allocation.getUserId(), names.get(allocation.getUserId())),
                        allocation.getProjectId(),
                        allocation.getWeekStart(),
                        allocation.getHours()))
                .toList();
    }
}
