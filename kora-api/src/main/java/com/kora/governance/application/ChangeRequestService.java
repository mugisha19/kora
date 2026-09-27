package com.kora.governance.application;

import com.kora.governance.ChangeRequestApproved;
import com.kora.governance.ChangeRequestChanged;
import com.kora.governance.domain.ApprovalHandler;
import com.kora.governance.domain.ApprovalHandler.ChangeContext;
import com.kora.governance.domain.ChangeRequest;
import com.kora.governance.domain.ChangeRequest.Impact;
import com.kora.governance.domain.ChangeRequestStatus;
import com.kora.governance.domain.ChangeRequestType;
import com.kora.governance.domain.Decision;
import com.kora.governance.domain.GovernanceSequence;
import com.kora.governance.domain.Issue;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectChangeControl;
import com.kora.portfolio.ProjectChangeControl.ApprovedChange;
import com.kora.portfolio.ProjectRef;
import com.kora.schedule.SchedulePlanning;
import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integrated change control (feature 14). The approval chain is built at submission from the impact and the
 * organization's thresholds ({@link ApprovalHandler}); the last approval applies the change to the budget, the target
 * end date, the charter and the schedule baseline in the same transaction, so a baseline never disagrees with the
 * decisions that changed it.
 */
@Service
public class ChangeRequestService {

    private final ChangeRequestRepository requests;
    private final IssueRepository issueRepository;
    private final ProjectAccess projects;
    private final ProjectChangeControl changeControl;
    private final SchedulePlanning schedule;
    private final ChangeControlService settings;
    private final GovernanceSupport support;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final ApprovalHandler chain = ApprovalHandler.standardChain();

    ChangeRequestService(
            ChangeRequestRepository requests,
            IssueRepository issueRepository,
            ProjectAccess projects,
            ProjectChangeControl changeControl,
            SchedulePlanning schedule,
            ChangeControlService settings,
            GovernanceSupport support,
            ApplicationEventPublisher events,
            Clock clock) {
        this.requests = requests;
        this.issueRepository = issueRepository;
        this.projects = projects;
        this.changeControl = changeControl;
        this.schedule = schedule;
        this.settings = settings;
        this.support = support;
        this.events = events;
        this.clock = clock;
    }

    public record NewChangeRequest(
            String title, String description, String reason, ChangeRequestType type, Impact impact, UUID issueId) {}

    /** Null fields stay as they are. */
    public record ChangeRequestChanges(
            String title, String description, String reason, ChangeRequestType type, Impact impact) {}

    @Transactional(readOnly = true)
    public Page<ChangeRequest> list(UUID projectId, ChangeRequestStatus status, Pageable pageable) {
        projects.readable(projectId);
        Pageable newestFirst = PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("revision")));
        return status == null
                ? requests.findByProjectId(projectId, newestFirst)
                : requests.findByProjectIdAndStatus(projectId, status, newestFirst);
    }

    @Transactional(readOnly = true)
    public ChangeRequest get(UUID requestId) {
        return find(requestId);
    }

    @Transactional
    public ChangeRequest create(UUID projectId, NewChangeRequest command) {
        ProjectRef project = projects.participating(projectId).project();
        Issue issue = null;
        if (command.issueId() != null) {
            issue = issueRepository
                    .findById(command.issueId())
                    .filter(candidate -> candidate.getProjectId().equals(projectId))
                    .orElseThrow(() -> new InvalidInputException(FieldViolation.of(
                            "issueId", PlatformErrorCodes.Field.INVALID, "must be an issue of this project")));
        }
        GovernanceSupport.Numbered numbered = support.next(project, GovernanceSequence.Kind.CR);
        ChangeRequest request = ChangeRequest.draft(
                support.organizationId(),
                projectId,
                numbered.key(),
                numbered.number(),
                command.title(),
                command.reason(),
                command.type(),
                support.me(),
                command.issueId(),
                clock.instant());
        request.describe(command.description());
        request.setImpact(command.impact() == null ? Impact.none() : command.impact());
        ChangeRequest saved = requests.saveAndFlush(request);
        if (issue != null) {
            issue.handledBy(saved.getId());
        }
        return saved;
    }

    @Transactional
    public ChangeRequest update(UUID requestId, long expectedVersion, ChangeRequestChanges changes) {
        ChangeRequest request = find(requestId);
        requireRequesterOrManager(request);
        OptimisticLock.check(expectedVersion, request.getVersion());
        request.edit(changes.title(), changes.description(), changes.reason(), changes.type(), changes.impact());
        return requests.saveAndFlush(request);
    }

    /** Builds the approval chain from the impact as it is now and the organization's thresholds. */
    @Transactional
    public ChangeRequest submit(UUID requestId) {
        ChangeRequest request = find(requestId);
        requireRequesterOrManager(request);
        ProjectChangeControl.Baseline baseline = changeControl.baseline(request.getProjectId());
        Impact impact = request.impact();
        ChangeContext context = new ChangeContext(
                request.getRequestedBy(),
                baseline.managerId(),
                baseline.sponsorId(),
                baseline.budget(),
                impact.costDelta(),
                impact.scheduleDeltaDays() == null ? 0 : impact.scheduleDeltaDays(),
                impact.changesCharterScope(),
                settings.current().thresholds());
        request.submit(chain.chainFor(context), clock.instant());
        ChangeRequest saved = requests.saveAndFlush(request);
        events.publishEvent(new ChangeRequestChanged(saved.getProjectId()));
        return saved;
    }

    /**
     * Records the caller's decision on the current step; the last approval applies the change.
     *
     * <p>Visibility is checked first, so a stranger gets 404; then the request itself decides whether this is the
     * caller's step.
     */
    @Transactional
    public ChangeRequest decide(UUID requestId, Decision decision, String comment) {
        ChangeRequest request = find(requestId);
        ActiveMember me = CurrentMember.get();
        boolean approved = request.decide(decision, comment, me.userId(), me.role(), clock.instant());
        ChangeRequest saved = requests.saveAndFlush(request);
        if (approved) {
            apply(saved, me.userId());
        }
        events.publishEvent(new ChangeRequestChanged(saved.getProjectId()));
        return saved;
    }

    @Transactional
    public ChangeRequest withdraw(UUID requestId) {
        ChangeRequest request = find(requestId);
        requireRequesterOrManager(request);
        request.withdraw();
        ChangeRequest saved = requests.saveAndFlush(request);
        events.publishEvent(new ChangeRequestChanged(saved.getProjectId()));
        return saved;
    }

    @Transactional
    public ChangeRequest implement(UUID requestId) {
        ChangeRequest request = find(requestId);
        projects.manageable(request.getProjectId());
        request.implement();
        return requests.saveAndFlush(request);
    }

    @Transactional
    public ChangeRequest revise(UUID requestId) {
        ChangeRequest rejected = find(requestId);
        requireRequesterOrManager(rejected);
        return requests.saveAndFlush(rejected.revise(support.me(), clock.instant()));
    }

    /** My approval inbox: requests whose current step I may decide, across the organization, oldest first. */
    @Transactional(readOnly = true)
    public List<ChangeRequest> pending() {
        ActiveMember me = CurrentMember.get();
        return requests
                .findByStatusInOrderBySubmittedAtAsc(
                        EnumSet.of(ChangeRequestStatus.SUBMITTED, ChangeRequestStatus.IN_REVIEW))
                .stream()
                .filter(request -> request.awaits(me.userId(), me.role()))
                .toList();
    }

    /** The approved change reaches every baseline it touches before the transaction commits. */
    private void apply(ChangeRequest request, UUID approver) {
        Impact impact = request.impact();
        ProjectRef project = projects.readable(request.getProjectId());
        int days = impact.scheduleDeltaDays() == null ? 0 : impact.scheduleDeltaDays();
        LocalDate newTargetEnd = days == 0
                ? null
                : schedule.shiftByWorkingDays(
                        changeControl.baseline(project.id()).targetEndDate(), days);
        Money cost = impact.costDelta();
        changeControl.apply(
                project.id(),
                new ApprovedChange(
                        request.getKey(),
                        cost,
                        newTargetEnd,
                        impact.scopeSummary(),
                        impact.changesCharterScope(),
                        approver));
        if (days != 0) {
            schedule.rebaseline(project, approver);
        }
        events.publishEvent(new ChangeRequestApproved(project.id(), request.getId(), request.getKey()));
    }

    private void requireRequesterOrManager(ChangeRequest request) {
        if (!request.mayBeEditedBy(support.me())) {
            projects.manageable(request.getProjectId());
        }
    }

    private ChangeRequest find(UUID requestId) {
        ChangeRequest request =
                requests.findById(requestId).orElseThrow(() -> NotFoundException.of("Change request", requestId));
        projects.readable(request.getProjectId());
        return request;
    }
}
