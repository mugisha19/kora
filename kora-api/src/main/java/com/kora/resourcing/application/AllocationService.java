package com.kora.resourcing.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.MemberDirectory;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import com.kora.resourcing.domain.Allocation;
import com.kora.resourcing.domain.IsoWeek;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Planned hours per person per week on a project (feature 16): its managers plan, its team reads. */
@Service
public class AllocationService {

    /** Open-ended ranges stay within dates the database stores. */
    private static final LocalDate EARLIEST = LocalDate.of(1900, 1, 1);

    private static final LocalDate LATEST = LocalDate.of(9999, 12, 31);

    private final AllocationRepository allocations;
    private final ProjectAccess projects;
    private final MemberDirectory members;

    AllocationService(AllocationRepository allocations, ProjectAccess projects, MemberDirectory members) {
        this.allocations = allocations;
        this.projects = projects;
        this.members = members;
    }

    public record AllocationInput(UUID userId, LocalDate weekStart, BigDecimal hours) {}

    @Transactional(readOnly = true)
    public List<Allocation> list(UUID projectId, LocalDate from, LocalDate to) {
        projects.readable(projectId);
        if (from == null && to == null) {
            return allocations.findByProjectIdOrderByWeekStartAscUserIdAsc(projectId);
        }
        return allocations.findByProjectIdAndWeekStartBetweenOrderByWeekStartAscUserIdAsc(
                projectId, from == null ? EARLIEST : IsoWeek.containing(from).monday(), to == null ? LATEST : to);
    }

    /** Upserts each person-week; zero hours removes it. Returns every allocation of the project. */
    @Transactional
    public List<Allocation> save(UUID projectId, List<AllocationInput> inputs) {
        projects.manageable(projectId);
        for (int i = 0; i < inputs.size(); i++) {
            AllocationInput input = inputs.get(i);
            if (input.weekStart().getDayOfWeek() != DayOfWeek.MONDAY) {
                throw invalid("allocations[" + i + "].weekStart", "must be a Monday");
            }
            if (members.find(input.userId()).isEmpty()) {
                throw invalid("allocations[" + i + "].userId", "is not a member of this organization");
            }
            IsoWeek week = new IsoWeek(input.weekStart());
            var existing = allocations.findByProjectIdAndUserIdAndWeekStart(projectId, input.userId(), week.monday());
            if (input.hours().signum() == 0) {
                existing.ifPresent(allocations::delete);
            } else if (existing.isPresent()) {
                existing.get().change(input.hours());
                allocations.save(existing.get());
            } else {
                allocations.save(Allocation.plan(
                        CurrentMember.get().organizationId(), projectId, input.userId(), week, input.hours()));
            }
        }
        return allocations.findByProjectIdOrderByWeekStartAscUserIdAsc(projectId);
    }

    private static InvalidInputException invalid(String field, String message) {
        return new InvalidInputException(FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, message));
    }
}
