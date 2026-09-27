package com.kora.governance.adapter.web;

import com.kora.governance.adapter.web.GovernanceDtos.CreateIssueRequest;
import com.kora.governance.adapter.web.GovernanceDtos.IssueResponse;
import com.kora.governance.adapter.web.GovernanceDtos.ReopenIssueRequest;
import com.kora.governance.adapter.web.GovernanceDtos.ResolveIssueRequest;
import com.kora.governance.adapter.web.GovernanceDtos.UpdateIssueRequest;
import com.kora.governance.application.IssueService;
import com.kora.governance.application.IssueService.IssueChanges;
import com.kora.governance.application.IssueService.NewIssue;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueStatus;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Issues} (feature 12). */
@RestController
class IssuesController {

    private final IssueService issues;
    private final GovernanceResponses responses;

    IssuesController(IssueService issues, GovernanceResponses responses) {
        this.issues = issues;
        this.responses = responses;
    }

    @GetMapping("/api/v1/projects/{projectId}/issues")
    PageResponse<IssueResponse> list(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "status", required = false) IssueStatus status,
            @RequestParam(name = "priority", required = false) IssuePriority priority,
            @RequestParam(name = "ownerId", required = false) UUID ownerId,
            @RequestParam(name = "overdue", defaultValue = "false") boolean overdue,
            @RequestParam(name = "q", required = false) @Size(max = 100) String q,
            Pageable pageable) {
        Page<Issue> page = issues.list(projectId, status, priority, ownerId, overdue, q, pageable);
        return PageResponse.from(
                new PageImpl<>(responses.issues(page.getContent()), page.getPageable(), page.getTotalElements()));
    }

    @PostMapping("/api/v1/projects/{projectId}/issues")
    ResponseEntity<IssueResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateIssueRequest body) {
        Issue issue = issues.create(
                projectId,
                new NewIssue(
                        body.title(),
                        body.description(),
                        body.type(),
                        body.priority(),
                        body.ownerId(),
                        body.dueDate()));
        return ResponseEntity.created(URI.create("/api/v1/issues/" + issue.getId()))
                .eTag(EntityTags.of(issue.getVersion()))
                .body(responses.issue(issue));
    }

    @GetMapping("/api/v1/issues/{issueId}")
    ResponseEntity<IssueResponse> get(@PathVariable("issueId") UUID issueId) {
        return withTag(issues.get(issueId));
    }

    @PatchMapping("/api/v1/issues/{issueId}")
    ResponseEntity<IssueResponse> update(
            @PathVariable("issueId") UUID issueId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateIssueRequest body) {
        if (body.status() != null && !body.status().isUnresolved()) {
            throw new InvalidInputException(FieldViolation.of(
                    "status", PlatformErrorCodes.Field.INVALID, "resolve, close and reopen have their own operations"));
        }
        return withTag(issues.update(
                issueId,
                expectedVersion,
                new IssueChanges(
                        body.title(),
                        body.description(),
                        body.type(),
                        body.priority(),
                        body.ownerId(),
                        body.dueDate(),
                        body.status())));
    }

    @PostMapping("/api/v1/issues/{issueId}/resolve")
    ResponseEntity<IssueResponse> resolve(
            @PathVariable("issueId") UUID issueId, @Valid @RequestBody ResolveIssueRequest body) {
        return withTag(issues.resolve(issueId, body.resolution()));
    }

    @PostMapping("/api/v1/issues/{issueId}/close")
    ResponseEntity<IssueResponse> close(@PathVariable("issueId") UUID issueId) {
        return withTag(issues.close(issueId));
    }

    @PostMapping("/api/v1/issues/{issueId}/reopen")
    ResponseEntity<IssueResponse> reopen(
            @PathVariable("issueId") UUID issueId, @Valid @RequestBody ReopenIssueRequest body) {
        return withTag(issues.reopen(issueId, body.reason()));
    }

    private ResponseEntity<IssueResponse> withTag(Issue issue) {
        return ResponseEntity.ok().eTag(EntityTags.of(issue.getVersion())).body(responses.issue(issue));
    }
}
