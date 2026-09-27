package com.kora.resourcing.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.organization.OrganizationTimeZone;
import com.kora.organization.Role;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import com.kora.resourcing.domain.Allocation;
import com.kora.resourcing.domain.CapacityPeriod;
import com.kora.resourcing.domain.IsoWeek;
import com.kora.resourcing.domain.Leave;
import com.kora.resourcing.domain.TimeEntry;
import com.kora.resourcing.domain.UtilizationBand;
import com.kora.resourcing.domain.WeeklyCapacity;
import com.kora.schedule.ScheduleQueries;
import com.kora.schedule.ScheduleQueries.WorkingWeek;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The resource heat map (feature 16): for each person and week, capacity (weekly hours less holidays and leave),
 * hours allocated across every project, hours logged, and allocated ÷ capacity.
 */
@Service
public class ResourceHeatmapService {

    static final int MAX_WEEKS = 26;
    private static final Set<Role> PLANNERS = EnumSet.of(Role.ORG_ADMIN, Role.PMO, Role.PROJECT_MANAGER);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final AllocationRepository allocations;
    private final CapacityRepository capacities;
    private final LeaveRepository leave;
    private final TimeEntryRepository entries;
    private final MemberDirectory members;
    private final ProjectAccess projects;
    private final ScheduleQueries schedule;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    ResourceHeatmapService(
            AllocationRepository allocations,
            CapacityRepository capacities,
            LeaveRepository leave,
            TimeEntryRepository entries,
            MemberDirectory members,
            ProjectAccess projects,
            ScheduleQueries schedule,
            OrganizationTimeZone timeZone,
            Clock clock) {
        this.allocations = allocations;
        this.capacities = capacities;
        this.leave = leave;
        this.entries = entries;
        this.members = members;
        this.projects = projects;
        this.schedule = schedule;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    public record Week(
            LocalDate weekStart,
            BigDecimal capacityHours,
            BigDecimal allocatedHours,
            BigDecimal actualHours,
            BigDecimal utilization,
            UtilizationBand band) {}

    public record Row(MemberSummary person, List<Week> weeks) {}

    public record Heatmap(LocalDate from, LocalDate to, List<Row> people) {}

    /**
     * Planners see everyone (or, with a project, the people allocated to it or logging time on it); anyone else
     * sees themselves.
     */
    @Transactional(readOnly = true)
    public Heatmap heatmap(LocalDate from, LocalDate to, UUID projectId) {
        ActiveMember caller = CurrentMember.get();
        LocalDate first = IsoWeek.containing(from != null ? from : LocalDate.now(clock.withZone(timeZone.zone())))
                .monday();
        LocalDate last =
                IsoWeek.containing(to != null ? to : first.plusWeeks(7)).monday();
        long weeks = ChronoUnit.WEEKS.between(first, last) + 1;
        if (weeks < 1 || weeks > MAX_WEEKS) {
            throw new InvalidInputException(FieldViolation.of(
                    "to", PlatformErrorCodes.Field.RANGE, "the range covers 1 to " + MAX_WEEKS + " weeks"));
        }
        LocalDate sunday = last.plusDays(6);
        List<MemberSummary> people = people(caller, projectId, first, sunday);
        Set<UUID> ids = people.stream().map(MemberSummary::userId).collect(Collectors.toSet());

        Map<UUID, List<CapacityPeriod>> capacityByPerson =
                capacities.findByUserIdIn(ids).stream().collect(Collectors.groupingBy(CapacityPeriod::getUserId));
        Map<UUID, List<Leave>> leaveByPerson =
                leave.findByUserIdInAndToGreaterThanEqualAndFromLessThanEqual(ids, first, sunday).stream()
                        .collect(Collectors.groupingBy(Leave::getUserId));
        Map<UUID, List<Allocation>> allocatedByPerson =
                allocations.findByUserIdInAndWeekStartBetween(ids, first, last).stream()
                        .collect(Collectors.groupingBy(Allocation::getUserId));
        Map<UUID, List<TimeEntry>> loggedByPerson = entries.findByUserIdInAndDateBetween(ids, first, sunday).stream()
                .collect(Collectors.groupingBy(TimeEntry::getUserId));
        WorkingWeek calendar = schedule.workingWeek();

        List<Row> rows = new ArrayList<>();
        for (MemberSummary person : people) {
            List<Week> row = new ArrayList<>();
            for (LocalDate monday = first; !monday.isAfter(last); monday = monday.plusWeeks(1)) {
                IsoWeek week = new IsoWeek(monday);
                BigDecimal capacity = WeeklyCapacity.of(
                        week,
                        capacityByPerson.getOrDefault(person.userId(), List.of()),
                        calendar.workingDays(),
                        calendar.holidays(),
                        leaveByPerson.getOrDefault(person.userId(), List.of()));
                BigDecimal allocated = allocatedByPerson.getOrDefault(person.userId(), List.of()).stream()
                        .filter(allocation -> allocation.getWeekStart().equals(week.monday()))
                        .map(Allocation::getHours)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal actual = loggedByPerson.getOrDefault(person.userId(), List.of()).stream()
                        .filter(entry -> week.contains(entry.getDate()))
                        .map(TimeEntry::getHours)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal utilization = capacity.signum() == 0
                        ? null
                        : allocated.multiply(HUNDRED).divide(capacity, 1, RoundingMode.HALF_EVEN);
                row.add(new Week(
                        monday,
                        capacity,
                        allocated,
                        actual,
                        utilization,
                        utilization == null ? null : UtilizationBand.of(utilization)));
            }
            rows.add(new Row(person, row));
        }
        return new Heatmap(first, last, rows);
    }

    private List<MemberSummary> people(ActiveMember caller, UUID projectId, LocalDate from, LocalDate to) {
        if (!PLANNERS.contains(caller.role())) {
            return members.find(caller.userId()).stream().toList();
        }
        if (projectId == null) {
            return members.everyone();
        }
        projects.readable(projectId);
        Set<UUID> involved = new LinkedHashSet<>();
        allocations
                .findByProjectIdAndWeekStartBetweenOrderByWeekStartAscUserIdAsc(projectId, from, to)
                .forEach(allocation -> involved.add(allocation.getUserId()));
        entries.findByProjectIdAndDateBetween(projectId, from, to).forEach(entry -> involved.add(entry.getUserId()));
        return members.everyone().stream()
                .filter(member -> involved.contains(member.userId()))
                .toList();
    }
}
