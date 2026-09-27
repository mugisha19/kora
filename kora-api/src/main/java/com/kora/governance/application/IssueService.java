package com.kora.governance.application;

import com.kora.governance.domain.GovernanceSequence;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueStatus;
import com.kora.governance.domain.IssueType;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The issue log (feature 12). The project's managers and contributors raise issues; an issue's owner or the managers
 * work on and resolve it; only the managers close and reopen.
 */
@Service
public class IssueService {

    static final SortPolicy SORT = SortPolicy.defaultingTo(
                    Sort.by(Sort.Order.desc("priorityRank"), Sort.Order.asc("dueDate"), Sort.Order.asc("number")))
            .allow("priority", "priorityRank")
            .allow("dueDate")
            .allow("key", "number")
            .allow("createdAt");

    private final IssueRepository issues;
    private final ProjectAccess projects;
    private final GovernanceSupport support;
    private final Clock clock;

    IssueService(IssueRepository issues, ProjectAccess projects, GovernanceSupport support, Clock clock) {
        this.issues = issues;
        this.projects = projects;
        this.support = support;
        this.clock = clock;
    }

    public record NewIssue(
            String title,
            String description,
            IssueType type,
            IssuePriority priority,
            UUID ownerId,
            LocalDate dueDate) {}

    /** Null fields stay as they are. */
    public record IssueChanges(
            String title,
            String description,
            IssueType type,
            IssuePriority priority,
            UUID ownerId,
            LocalDate dueDate,
            IssueStatus status) {}

    /** @param overdue only unresolved issues past their due date, in the organization's today */
    @Transactional(readOnly = true)
    public Page<Issue> list(
            UUID projectId,
            IssueStatus status,
            IssuePriority priority,
            UUID ownerId,
            boolean overdue,
            String q,
            Pageable pageable) {
        projects.readable(projectId);
        return issues.search(
                new IssueSearch(projectId, status, priority, ownerId, overdue ? support.today() : null, q),
                SORT.apply(pageable));
    }

    @Transactional(readOnly = true)
    public Issue get(UUID issueId) {
        return find(issueId);
    }

    @Transactional
    public Issue create(UUID projectId, NewIssue command) {
        ProjectRef project = projects.participating(projectId).project();
        support.requireMember(command.ownerId(), "ownerId");
        GovernanceSupport.Numbered numbered = support.next(project, GovernanceSequence.Kind.I);
        Issue issue = Issue.raise(
                support.organizationId(),
                projectId,
                numbered.key(),
                numbered.number(),
                command.title(),
                command.type(),
                command.priority(),
                support.me(),
                null,
                clock.instant());
        issue.describe(command.description());
        issue.assignOwner(command.ownerId());
        issue.dueOn(command.dueDate());
        return issues.saveAndFlush(issue);
    }

    @Transactional
    public Issue update(UUID issueId, long expectedVersion, IssueChanges changes) {
        Issue issue = find(issueId);
        support.requireManagerOrOwner(issue.getProjectId(), issue.getOwnerId());
        OptimisticLock.check(expectedVersion, issue.getVersion());
        if (changes.title() != null) {
            issue.retitle(changes.title());
        }
        if (changes.description() != null) {
            issue.describe(changes.description());
        }
        if (changes.type() != null) {
            issue.classify(changes.type());
        }
        if (changes.priority() != null) {
            issue.prioritize(changes.priority());
        }
        if (changes.ownerId() != null) {
            support.requireMember(changes.ownerId(), "ownerId");
            issue.assignOwner(changes.ownerId());
        }
        if (changes.dueDate() != null) {
            issue.dueOn(changes.dueDate());
        }
        if (changes.status() != null) {
            issue.work(changes.status());
        }
        return issues.saveAndFlush(issue);
    }

    @Transactional
    public Issue resolve(UUID issueId, String resolution) {
        Issue issue = find(issueId);
        support.requireManagerOrOwner(issue.getProjectId(), issue.getOwnerId());
        issue.resolve(resolution, clock.instant());
        return issues.saveAndFlush(issue);
    }

    @Transactional
    public Issue close(UUID issueId) {
        Issue issue = find(issueId);
        projects.manageable(issue.getProjectId());
        issue.close();
        return issues.saveAndFlush(issue);
    }

    /** The reason is recorded with the audit trail (Phase 8); the issue itself only forgets its old resolution. */
    @Transactional
    public Issue reopen(UUID issueId, String reason) {
        Issue issue = find(issueId);
        projects.manageable(issue.getProjectId());
        issue.reopen();
        return issues.saveAndFlush(issue);
    }

    Issue find(UUID issueId) {
        Issue issue = issues.findById(issueId).orElseThrow(() -> NotFoundException.of("Issue", issueId));
        projects.readable(issue.getProjectId());
        return issue;
    }
}
