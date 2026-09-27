package com.kora.portfolio.application;

import com.kora.platform.error.NotFoundException;
import com.kora.platform.money.Money;
import com.kora.portfolio.ProjectChangeControl;
import com.kora.portfolio.ProjectChanged;
import com.kora.portfolio.application.PortfolioRepositories.CharterRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import com.kora.portfolio.domain.Charter;
import com.kora.portfolio.domain.CharterContent;
import com.kora.portfolio.domain.CharterStatus;
import com.kora.portfolio.domain.Project;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ProjectChangeControlService implements ProjectChangeControl {

    private final ProjectRepository projects;
    private final CharterRepository charters;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    ProjectChangeControlService(
            ProjectRepository projects, CharterRepository charters, ApplicationEventPublisher events, Clock clock) {
        this.projects = projects;
        this.charters = charters;
        this.events = events;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Baseline baseline(UUID projectId) {
        Project project = find(projectId);
        UUID sponsor = current(projectId).map(Charter::getSponsorId).orElse(null);
        return new Baseline(
                project.getManagerId(),
                sponsor,
                project.getBudget(),
                project.getStartDate(),
                project.getTargetEndDate());
    }

    @Override
    @Transactional
    public void apply(UUID projectId, ApprovedChange change) {
        Project project = find(projectId);
        if (change.costDelta() != null && project.getBudget() != null) {
            project.changeBudget(atLeastZero(project.getBudget().plus(change.costDelta())));
        }
        if (change.newTargetEndDate() != null) {
            project.reschedule(project.getStartDate(), change.newTargetEndDate());
        }
        projects.saveAndFlush(project);
        if (change.amendCharter()) {
            current(projectId)
                    .filter(charter -> charter.getStatus() == CharterStatus.APPROVED)
                    .ifPresent(charter -> amend(charter, change));
        }
        events.publishEvent(new ProjectChanged(projectId));
    }

    /** Only an approved charter is amended; before approval, the draft is still edited directly. */
    private void amend(Charter approved, ApprovedChange change) {
        CharterContent content = approved.content();
        List<String> inScope = new ArrayList<>(content.inScope());
        if (change.scopeAddition() != null && !change.scopeAddition().isBlank()) {
            inScope.add(change.scopeAddition().strip() + " (" + change.reference() + ")");
        }
        Money summaryBudget = content.summaryBudget();
        if (summaryBudget != null && change.costDelta() != null) {
            summaryBudget = atLeastZero(summaryBudget.plus(change.costDelta()));
        }
        CharterContent amended = new CharterContent(
                content.purpose(),
                content.businessCase(),
                content.objectives(),
                inScope,
                content.outOfScope(),
                content.assumptions(),
                content.constraints(),
                content.highLevelRisks(),
                content.milestones(),
                summaryBudget,
                content.sponsorId());
        Charter next = approved.amend(amended, change.approvedBy(), clock.instant());
        charters.saveAndFlush(approved);
        charters.save(next);
    }

    private Optional<Charter> current(UUID projectId) {
        return charters.findFirstByProjectIdAndStatusNot(projectId, CharterStatus.SUPERSEDED);
    }

    private Project find(UUID projectId) {
        return projects.findById(projectId).orElseThrow(() -> NotFoundException.of("Project", projectId));
    }

    /** A saving larger than the budget leaves nothing, not a negative budget. */
    private static Money atLeastZero(Money money) {
        return money.isNegative() ? Money.zero(money.currency()) : money;
    }
}
