package com.kora.portfolio.adapter.web;

import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.UserRefJson;
import com.kora.portfolio.adapter.web.PortfolioDtos.CharterResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.MilestoneJson;
import com.kora.portfolio.adapter.web.PortfolioDtos.ObjectiveJson;
import com.kora.portfolio.adapter.web.PortfolioDtos.PortfolioResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.ProgramResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.ProjectResponse;
import com.kora.portfolio.application.People;
import com.kora.portfolio.application.PortfolioService.PortfolioView;
import com.kora.portfolio.application.ProgramService.ProgramView;
import com.kora.portfolio.domain.Charter;
import com.kora.portfolio.domain.CharterContent;
import com.kora.portfolio.domain.Portfolio;
import com.kora.portfolio.domain.Program;
import com.kora.portfolio.domain.Project;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * Turns domain objects into contract responses. People are named in one lookup per response (or page), never one
 * query per row.
 */
@Component
class PortfolioResponses {

    private final People people;

    PortfolioResponses(People people) {
        this.people = people;
    }

    List<PortfolioResponse> portfolios(Collection<PortfolioView> views) {
        Map<UUID, People.Person> names =
                people.lookup(ids(views, view -> view.portfolio().getOwnerId()));
        return views.stream().map(view -> portfolio(view, names)).toList();
    }

    PortfolioResponse portfolio(PortfolioView view) {
        return portfolios(List.of(view)).getFirst();
    }

    List<ProgramResponse> programs(Collection<ProgramView> views) {
        Map<UUID, People.Person> names =
                people.lookup(ids(views, view -> view.program().getManagerId()));
        return views.stream().map(view -> program(view, names)).toList();
    }

    ProgramResponse program(ProgramView view) {
        return programs(List.of(view)).getFirst();
    }

    List<ProjectResponse> projects(Collection<Project> projects) {
        Map<UUID, People.Person> names = people.lookup(ids(projects, Project::getManagerId));
        return projects.stream().map(project -> project(project, names)).toList();
    }

    ProjectResponse project(Project project) {
        return projects(List.of(project)).getFirst();
    }

    List<CharterResponse> charters(Collection<Charter> charters) {
        List<UUID> ids = new ArrayList<>();
        charters.forEach(charter -> {
            ids.add(charter.getSponsorId());
            ids.add(charter.getApprovedBy());
        });
        Map<UUID, People.Person> names = people.lookup(ids);
        return charters.stream().map(charter -> charter(charter, names)).toList();
    }

    CharterResponse charter(Charter charter) {
        return charters(List.of(charter)).getFirst();
    }

    private static PortfolioResponse portfolio(PortfolioView view, Map<UUID, People.Person> names) {
        Portfolio portfolio = view.portfolio();
        return new PortfolioResponse(
                portfolio.getId(),
                portfolio.getName(),
                portfolio.getDescription(),
                portfolio.getStrategicObjectives(),
                ref(names, portfolio.getOwnerId()),
                portfolio.getStatus(),
                view.programCount(),
                view.projectCount(),
                portfolio.getCreatedAt(),
                portfolio.getVersion());
    }

    private static ProgramResponse program(ProgramView view, Map<UUID, People.Person> names) {
        Program program = view.program();
        return new ProgramResponse(
                program.getId(),
                program.getPortfolioId(),
                program.getName(),
                program.getDescription(),
                ref(names, program.getManagerId()),
                program.getStatus(),
                view.projectCount(),
                program.getCreatedAt(),
                program.getVersion());
    }

    private static ProjectResponse project(Project project, Map<UUID, People.Person> names) {
        return new ProjectResponse(
                project.getId(),
                project.getCode(),
                project.getName(),
                project.getDescription(),
                project.getPortfolioId(),
                project.getProgramId(),
                ref(names, project.getManagerId()),
                project.getMethodology(),
                project.getStatus(),
                project.manualTransitions(),
                project.getStartDate(),
                project.getTargetEndDate(),
                MoneyJson.from(project.getBudget()),
                project.effectiveHealth(),
                project.effectiveHealthReason(),
                project.isHealthOverridden(),
                project.getCreatedAt(),
                project.getVersion());
    }

    private static CharterResponse charter(Charter charter, Map<UUID, People.Person> names) {
        CharterContent content = charter.content();
        return new CharterResponse(
                charter.getProjectId(),
                charter.getVersionNumber(),
                charter.getStatus().name(),
                content.purpose(),
                content.businessCase(),
                content.objectives().stream()
                        .map(objective -> new ObjectiveJson(objective.text(), objective.successMetric()))
                        .toList(),
                content.inScope(),
                content.outOfScope(),
                content.assumptions(),
                content.constraints(),
                content.highLevelRisks(),
                content.milestones().stream()
                        .map(milestone -> new MilestoneJson(milestone.name(), milestone.targetDate()))
                        .toList(),
                MoneyJson.from(content.summaryBudget()),
                ref(names, content.sponsorId()),
                charter.getSubmittedAt(),
                ref(names, charter.getApprovedBy()),
                charter.getApprovedAt(),
                charter.getReturnComment(),
                charter.getVersion());
    }

    private static UserRefJson ref(Map<UUID, People.Person> names, UUID userId) {
        return userId == null ? null : new UserRefJson(userId, names.get(userId).fullName());
    }

    private static <T> List<UUID> ids(Collection<T> items, Function<T, UUID> id) {
        return items.stream().map(id).toList();
    }
}
