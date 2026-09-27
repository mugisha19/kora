package com.kora.governance.adapter.web;

import com.kora.governance.adapter.web.GovernanceDtos.ChangeControlSettingsResponse;
import com.kora.governance.adapter.web.GovernanceDtos.ChangeRequestResponse;
import com.kora.governance.adapter.web.GovernanceDtos.CreateChangeRequestRequest;
import com.kora.governance.adapter.web.GovernanceDtos.DecisionRequest;
import com.kora.governance.adapter.web.GovernanceDtos.ImpactJson;
import com.kora.governance.adapter.web.GovernanceDtos.UpdateChangeControlSettingsRequest;
import com.kora.governance.adapter.web.GovernanceDtos.UpdateChangeRequestRequest;
import com.kora.governance.application.ChangeControlService;
import com.kora.governance.application.ChangeRequestService;
import com.kora.governance.application.ChangeRequestService.ChangeRequestChanges;
import com.kora.governance.application.ChangeRequestService.NewChangeRequest;
import com.kora.governance.domain.ChangeControlSettings;
import com.kora.governance.domain.ChangeRequest;
import com.kora.governance.domain.ChangeRequest.Impact;
import com.kora.governance.domain.ChangeRequestStatus;
import com.kora.organization.OrganizationCurrency;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code ChangeRequests} (feature 14). */
@RestController
class ChangeRequestsController {

    private final ChangeRequestService requests;
    private final ChangeControlService settings;
    private final GovernanceResponses responses;
    private final OrganizationCurrency currency;

    ChangeRequestsController(
            ChangeRequestService requests,
            ChangeControlService settings,
            GovernanceResponses responses,
            OrganizationCurrency currency) {
        this.requests = requests;
        this.settings = settings;
        this.responses = responses;
        this.currency = currency;
    }

    @GetMapping("/api/v1/projects/{projectId}/change-requests")
    PageResponse<ChangeRequestResponse> list(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "status", required = false) ChangeRequestStatus status,
            Pageable pageable) {
        Page<ChangeRequest> page = requests.list(projectId, status, pageable);
        return PageResponse.from(new PageImpl<>(
                responses.changeRequests(page.getContent()), page.getPageable(), page.getTotalElements()));
    }

    @PostMapping("/api/v1/projects/{projectId}/change-requests")
    ResponseEntity<ChangeRequestResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateChangeRequestRequest body) {
        ChangeRequest request = requests.create(
                projectId,
                new NewChangeRequest(
                        body.title(),
                        body.description(),
                        body.reason(),
                        body.type(),
                        impact(body.impact()),
                        body.issueId()));
        return ResponseEntity.created(URI.create("/api/v1/change-requests/" + request.getId()))
                .eTag(EntityTags.of(request.getVersion()))
                .body(responses.changeRequest(request));
    }

    @GetMapping("/api/v1/change-requests/{changeRequestId}")
    ResponseEntity<ChangeRequestResponse> get(@PathVariable("changeRequestId") UUID changeRequestId) {
        return withTag(requests.get(changeRequestId));
    }

    @PatchMapping("/api/v1/change-requests/{changeRequestId}")
    ResponseEntity<ChangeRequestResponse> update(
            @PathVariable("changeRequestId") UUID changeRequestId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateChangeRequestRequest body) {
        return withTag(requests.update(
                changeRequestId,
                expectedVersion,
                new ChangeRequestChanges(
                        body.title(), body.description(), body.reason(), body.type(), impact(body.impact()))));
    }

    @PostMapping("/api/v1/change-requests/{changeRequestId}/submit")
    ResponseEntity<ChangeRequestResponse> submit(@PathVariable("changeRequestId") UUID changeRequestId) {
        return withTag(requests.submit(changeRequestId));
    }

    @PostMapping("/api/v1/change-requests/{changeRequestId}/decisions")
    ResponseEntity<ChangeRequestResponse> decide(
            @PathVariable("changeRequestId") UUID changeRequestId, @Valid @RequestBody DecisionRequest body) {
        return withTag(requests.decide(changeRequestId, body.decision(), body.comment()));
    }

    @PostMapping("/api/v1/change-requests/{changeRequestId}/withdraw")
    ResponseEntity<ChangeRequestResponse> withdraw(@PathVariable("changeRequestId") UUID changeRequestId) {
        return withTag(requests.withdraw(changeRequestId));
    }

    @PostMapping("/api/v1/change-requests/{changeRequestId}/implement")
    ResponseEntity<ChangeRequestResponse> implement(@PathVariable("changeRequestId") UUID changeRequestId) {
        return withTag(requests.implement(changeRequestId));
    }

    @PostMapping("/api/v1/change-requests/{changeRequestId}/revise")
    ResponseEntity<ChangeRequestResponse> revise(@PathVariable("changeRequestId") UUID changeRequestId) {
        ChangeRequest revision = requests.revise(changeRequestId);
        return ResponseEntity.created(URI.create("/api/v1/change-requests/" + revision.getId()))
                .eTag(EntityTags.of(revision.getVersion()))
                .body(responses.changeRequest(revision));
    }

    @GetMapping("/api/v1/approvals/pending")
    List<ChangeRequestResponse> pending() {
        return responses.changeRequests(requests.pending());
    }

    @GetMapping("/api/v1/organization/change-control")
    ResponseEntity<ChangeControlSettingsResponse> settings() {
        return withTag(settings.current());
    }

    @PutMapping("/api/v1/organization/change-control")
    ResponseEntity<ChangeControlSettingsResponse> replaceSettings(
            @IfMatchVersion long expectedVersion, @Valid @RequestBody UpdateChangeControlSettingsRequest body) {
        return withTag(settings.replace(
                expectedVersion, body.pmoCostPercent(), body.pmoScheduleDays(), body.sponsorCostPercent()));
    }

    /** Amounts are in the organization's currency; the request states it, and a different one is refused. */
    private Impact impact(ImpactJson json) {
        if (json == null) {
            return null;
        }
        return new Impact(
                json.costDelta() == null ? null : json.costDelta().toMoney("impact.costDelta", currency.current()),
                json.scheduleDeltaDays(),
                json.scopeSummary(),
                json.riskSummary(),
                Boolean.TRUE.equals(json.changesCharterScope()));
    }

    private ResponseEntity<ChangeRequestResponse> withTag(ChangeRequest request) {
        return ResponseEntity.ok().eTag(EntityTags.of(request.getVersion())).body(responses.changeRequest(request));
    }

    private static ResponseEntity<ChangeControlSettingsResponse> withTag(ChangeControlSettings current) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(current.getVersion()))
                .body(new ChangeControlSettingsResponse(
                        current.getPmoCostPercent(),
                        current.getPmoScheduleDays(),
                        current.getSponsorCostPercent(),
                        current.getVersion()));
    }
}
