package com.kora.portfolio.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.portfolio.application.PortfolioRepositories.ProgramRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import com.kora.portfolio.domain.Portfolio;
import com.kora.portfolio.domain.Program;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Programs inside a portfolio (feature 04). */
@Service
public class ProgramService {

    private final ProgramRepository programs;
    private final ProjectRepository projects;
    private final PortfolioService portfolios;
    private final People people;
    private final Clock clock;

    ProgramService(
            ProgramRepository programs,
            ProjectRepository projects,
            PortfolioService portfolios,
            People people,
            Clock clock) {
        this.programs = programs;
        this.projects = projects;
        this.portfolios = portfolios;
        this.people = people;
        this.clock = clock;
    }

    public record ProgramView(Program program, long projectCount) {}

    public record ProgramChanges(String name, String description, UUID managerId, Program.Status status) {}

    @Transactional(readOnly = true)
    public List<ProgramView> list(UUID portfolioId) {
        CurrentMember.get();
        portfolios.find(portfolioId);
        List<Program> list = programs.findByPortfolioIdOrderByName(portfolioId);
        Map<UUID, Long> counts = projects
                .countByProgram(list.stream().map(Program::getId).toList())
                .stream()
                .collect(Collectors.toMap(OwnerCount::ownerId, OwnerCount::count));
        return list.stream()
                .map(program -> new ProgramView(program, counts.getOrDefault(program.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public ProgramView get(UUID programId) {
        CurrentMember.get();
        return view(find(programId));
    }

    @Transactional
    public ProgramView create(UUID portfolioId, String name, String description, UUID managerId) {
        ActiveMember caller = CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        Portfolio portfolio = portfolios.find(portfolioId);
        portfolio.ensureActive();
        people.requireRole(managerId, "managerId", People.MANAGERS);
        Program program = programs.save(
                Program.create(caller.organizationId(), portfolioId, name, description, managerId, clock.instant()));
        return new ProgramView(program, 0);
    }

    @Transactional
    public ProgramView update(UUID programId, long expectedVersion, ProgramChanges changes) {
        CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        Program program = find(programId);
        OptimisticLock.check(expectedVersion, program.getVersion());
        portfolios.find(program.getPortfolioId()).ensureActive();
        if (changes.name() != null) {
            program.rename(changes.name());
        }
        if (changes.description() != null) {
            program.describe(changes.description());
        }
        if (changes.managerId() != null) {
            people.requireRole(changes.managerId(), "managerId", People.MANAGERS);
            program.assignManager(changes.managerId());
        }
        if (changes.status() != null) {
            program.changeStatus(changes.status());
        }
        return view(programs.saveAndFlush(program));
    }

    Program find(UUID programId) {
        return programs.findById(programId).orElseThrow(() -> NotFoundException.of("Program", programId));
    }

    private ProgramView view(Program program) {
        long count = projects.countByProgram(List.of(program.getId())).stream()
                .mapToLong(OwnerCount::count)
                .sum();
        return new ProgramView(program, count);
    }
}
