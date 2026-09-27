package com.kora.governance.adapter.web;

import com.kora.governance.adapter.web.GovernanceDtos.AssessRiskRequest;
import com.kora.governance.adapter.web.GovernanceDtos.CloseRiskRequest;
import com.kora.governance.adapter.web.GovernanceDtos.CreateRiskRequest;
import com.kora.governance.adapter.web.GovernanceDtos.IssueResponse;
import com.kora.governance.adapter.web.GovernanceDtos.MaterializeRiskRequest;
import com.kora.governance.adapter.web.GovernanceDtos.RiskAssessmentResponse;
import com.kora.governance.adapter.web.GovernanceDtos.RiskHeatmapCellResponse;
import com.kora.governance.adapter.web.GovernanceDtos.RiskHeatmapResponse;
import com.kora.governance.adapter.web.GovernanceDtos.RiskResponse;
import com.kora.governance.adapter.web.GovernanceDtos.UpdateRiskRequest;
import com.kora.governance.application.RiskSearch;
import com.kora.governance.application.RiskService;
import com.kora.governance.application.RiskService.Assessment;
import com.kora.governance.application.RiskService.NewIssueFromRisk;
import com.kora.governance.application.RiskService.NewRisk;
import com.kora.governance.application.RiskService.RiskChanges;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.Risk;
import com.kora.governance.domain.RiskCategory;
import com.kora.governance.domain.RiskKind;
import com.kora.governance.domain.RiskStatus;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Risks} (feature 11). */
@RestController
class RisksController {

    private final RiskService risks;
    private final GovernanceResponses responses;

    RisksController(RiskService risks, GovernanceResponses responses) {
        this.risks = risks;
        this.responses = responses;
    }

    @GetMapping("/api/v1/projects/{projectId}/risks")
    PageResponse<RiskResponse> list(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "status", required = false) RiskStatus status,
            @RequestParam(name = "kind", required = false) RiskKind kind,
            @RequestParam(name = "category", required = false) RiskCategory category,
            @RequestParam(name = "ownerId", required = false) UUID ownerId,
            @RequestParam(name = "minScore", required = false) @Min(1) @Max(25) Integer minScore,
            @RequestParam(name = "q", required = false) @Size(max = 100) String q,
            Pageable pageable) {
        return page(risks.list(
                projectId,
                new RiskSearch(Set.of(projectId), status, kind, category, ownerId, minScore, q, false),
                pageable));
    }

    @GetMapping("/api/v1/risks")
    PageResponse<RiskResponse> portfolio(
            @RequestParam(name = "portfolioId", required = false) UUID portfolioId,
            @RequestParam(name = "minScore", required = false) @Min(1) @Max(25) Integer minScore,
            Pageable pageable) {
        return page(risks.portfolio(portfolioId, minScore, pageable));
    }

    @GetMapping("/api/v1/projects/{projectId}/risks/heatmap")
    RiskHeatmapResponse heatmap(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "kind", required = false) RiskKind kind,
            @RequestParam(name = "category", required = false) RiskCategory category,
            @RequestParam(name = "ownerId", required = false) UUID ownerId) {
        return new RiskHeatmapResponse(
                projectId,
                risks.heatmap(projectId, kind, category, ownerId).stream()
                        .map(cell -> new RiskHeatmapCellResponse(
                                cell.probability(),
                                cell.impact(),
                                cell.score(),
                                cell.severity(),
                                cell.riskIds().size(),
                                cell.riskIds()))
                        .toList());
    }

    @PostMapping("/api/v1/projects/{projectId}/risks")
    ResponseEntity<RiskResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateRiskRequest body) {
        Risk risk = risks.create(
                projectId,
                new NewRisk(
                        body.title(),
                        body.description(),
                        body.kind(),
                        body.category(),
                        body.proximity(),
                        body.probability(),
                        body.impact(),
                        body.ownerId(),
                        body.responseStrategy(),
                        body.responsePlan(),
                        body.triggerConditions(),
                        body.reviewDate()));
        return ResponseEntity.created(URI.create("/api/v1/risks/" + risk.getId()))
                .eTag(EntityTags.of(risk.getVersion()))
                .body(responses.risk(risk));
    }

    @GetMapping("/api/v1/risks/{riskId}")
    ResponseEntity<RiskResponse> get(@PathVariable("riskId") UUID riskId) {
        return withTag(risks.get(riskId));
    }

    @PatchMapping("/api/v1/risks/{riskId}")
    ResponseEntity<RiskResponse> update(
            @PathVariable("riskId") UUID riskId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateRiskRequest body) {
        return withTag(risks.update(
                riskId,
                expectedVersion,
                new RiskChanges(
                        body.title(),
                        body.description(),
                        body.category(),
                        body.proximity(),
                        body.ownerId(),
                        body.responseStrategy(),
                        body.responsePlan(),
                        body.triggerConditions(),
                        body.reviewDate(),
                        body.status())));
    }

    @GetMapping("/api/v1/risks/{riskId}/assessments")
    List<RiskAssessmentResponse> assessments(@PathVariable("riskId") UUID riskId) {
        return responses.assessments(risks.assessments(riskId));
    }

    @PostMapping("/api/v1/risks/{riskId}/assessments")
    @ResponseStatus(HttpStatus.CREATED)
    RiskAssessmentResponse assess(@PathVariable("riskId") UUID riskId, @Valid @RequestBody AssessRiskRequest body) {
        return responses
                .assessments(List.of(risks.assess(
                        riskId,
                        new Assessment(
                                body.probability(),
                                body.impact(),
                                body.residualProbability(),
                                body.residualImpact(),
                                body.note()))))
                .getFirst();
    }

    @PostMapping("/api/v1/risks/{riskId}/close")
    ResponseEntity<RiskResponse> close(@PathVariable("riskId") UUID riskId, @Valid @RequestBody CloseRiskRequest body) {
        return withTag(risks.close(riskId, body.note()));
    }

    @PostMapping("/api/v1/risks/{riskId}/materialize")
    ResponseEntity<IssueResponse> materialize(
            @PathVariable("riskId") UUID riskId, @Valid @RequestBody MaterializeRiskRequest body) {
        Issue issue = risks.materialize(
                riskId, new NewIssueFromRisk(body.title(), body.priority(), body.ownerId(), body.dueDate()));
        return ResponseEntity.created(URI.create("/api/v1/issues/" + issue.getId()))
                .eTag(EntityTags.of(issue.getVersion()))
                .body(responses.issue(issue));
    }

    private PageResponse<RiskResponse> page(Page<Risk> page) {
        return PageResponse.from(
                new PageImpl<>(responses.risks(page.getContent()), page.getPageable(), page.getTotalElements()));
    }

    private ResponseEntity<RiskResponse> withTag(Risk risk) {
        return ResponseEntity.ok().eTag(EntityTags.of(risk.getVersion())).body(responses.risk(risk));
    }
}
