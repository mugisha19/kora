package com.kora.portfolio.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.portfolio.CharterApproved;
import com.kora.portfolio.ProjectChanged;
import com.kora.portfolio.ProjectStatusChanged;
import com.kora.portfolio.application.PortfolioRepositories.CharterRepository;
import com.kora.portfolio.domain.Charter;
import com.kora.portfolio.domain.CharterContent;
import com.kora.portfolio.domain.CharterStatus;
import com.kora.portfolio.domain.Project;
import com.kora.portfolio.domain.ProjectStatus;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The project charter (feature 06): the manager drafts and submits it; the sponsor, {@code PMO} or an administrator
 * approves it (which authorizes the project) or returns it with a comment.
 */
@Service
public class CharterService {

    private final CharterRepository charters;
    private final ProjectAccessService access;
    private final ProjectService projects;
    private final People people;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    CharterService(
            CharterRepository charters,
            ProjectAccessService access,
            ProjectService projects,
            People people,
            ApplicationEventPublisher events,
            Clock clock) {
        this.charters = charters;
        this.access = access;
        this.projects = projects;
        this.people = people;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Charter current(UUID projectId) {
        access.loadVisible(projectId);
        return currentOf(projectId);
    }

    @Transactional(readOnly = true)
    public List<Charter> versions(UUID projectId) {
        access.loadVisible(projectId);
        return charters.findByProjectIdOrderByVersionNumberDesc(projectId);
    }

    /** Replaces the whole draft. The sponsor is added to the team as an observer so they can see what they approve. */
    @Transactional
    public Charter replace(UUID projectId, long expectedVersion, CharterContent content) {
        Project project = access.loadManageable(projectId);
        Charter charter = currentOf(projectId);
        OptimisticLock.check(expectedVersion, charter.getVersion());
        if (content.sponsorId() != null) {
            people.requireMember(content.sponsorId(), "sponsorId");
        }
        charter.replaceContent(content);
        if (content.sponsorId() != null) {
            projects.ensureCanSee(project, content.sponsorId());
        }
        Charter saved = charters.saveAndFlush(charter);
        events.publishEvent(new ProjectChanged(projectId));
        return saved;
    }

    @Transactional
    public Charter submit(UUID projectId) {
        access.loadManageable(projectId);
        Charter charter = currentOf(projectId);
        charter.submit(CurrentMember.get().userId(), clock.instant());
        return charters.saveAndFlush(charter);
    }

    /** Approval authorizes the project: a {@code PROPOSED} project becomes {@code APPROVED} in the same transaction. */
    @Transactional
    public Charter approve(UUID projectId) {
        Project project = access.loadVisible(projectId);
        Charter charter = currentOf(projectId);
        ActiveMember approver = requireApprover(charter);
        access.ensurePortfolioActive(project.getPortfolioId());
        charter.approve(approver.userId(), clock.instant());
        ProjectStatus before = project.getStatus();
        project.authorizeByCharter();
        Charter saved = charters.saveAndFlush(charter);
        events.publishEvent(new CharterApproved(projectId, saved.getVersionNumber(), approver.userId()));
        if (before != project.getStatus()) {
            events.publishEvent(new ProjectStatusChanged(
                    projectId, before.name(), project.getStatus().name(), "Charter approved"));
        }
        events.publishEvent(new ProjectChanged(projectId));
        return saved;
    }

    @Transactional
    public Charter returnForChanges(UUID projectId, String comment) {
        Project project = access.loadVisible(projectId);
        Charter charter = currentOf(projectId);
        requireApprover(charter);
        access.ensurePortfolioActive(project.getPortfolioId());
        charter.returnForChanges(comment);
        return charters.saveAndFlush(charter);
    }

    private ActiveMember requireApprover(Charter charter) {
        ActiveMember caller = CurrentMember.get();
        boolean sponsor = caller.userId().equals(charter.getSponsorId());
        if (!sponsor && !ProjectAccessService.seesEverything(caller)) {
            throw new ForbiddenException("Only the sponsor, PMO or an administrator can decide on the charter");
        }
        return caller;
    }

    private Charter currentOf(UUID projectId) {
        return charters.findFirstByProjectIdAndStatusNot(projectId, CharterStatus.SUPERSEDED)
                .orElseThrow(() -> NotFoundException.of("Charter of project", projectId));
    }
}
