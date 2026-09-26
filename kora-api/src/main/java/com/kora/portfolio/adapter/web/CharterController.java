package com.kora.portfolio.adapter.web;

import com.kora.organization.OrganizationCurrency;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.portfolio.adapter.web.PortfolioDtos.CharterContentRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.CharterResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.ReturnCharterRequest;
import com.kora.portfolio.application.CharterService;
import com.kora.portfolio.domain.Charter;
import com.kora.portfolio.domain.CharterContent;
import com.kora.portfolio.domain.CharterMilestone;
import com.kora.portfolio.domain.CharterObjective;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Charter} (feature 06). */
@RestController
@RequestMapping("/api/v1/projects/{projectId}/charter")
class CharterController {

    private final CharterService charters;
    private final PortfolioResponses responses;
    private final OrganizationCurrency currency;

    CharterController(CharterService charters, PortfolioResponses responses, OrganizationCurrency currency) {
        this.charters = charters;
        this.responses = responses;
        this.currency = currency;
    }

    @GetMapping
    ResponseEntity<CharterResponse> current(@PathVariable("projectId") UUID projectId) {
        return withETag(charters.current(projectId));
    }

    @PutMapping
    ResponseEntity<CharterResponse> replace(
            @PathVariable("projectId") UUID projectId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody CharterContentRequest body) {
        return withETag(charters.replace(projectId, expectedVersion, content(body)));
    }

    @PostMapping("/submit")
    ResponseEntity<CharterResponse> submit(@PathVariable("projectId") UUID projectId) {
        return withETag(charters.submit(projectId));
    }

    @PostMapping("/approve")
    ResponseEntity<CharterResponse> approve(@PathVariable("projectId") UUID projectId) {
        return withETag(charters.approve(projectId));
    }

    @PostMapping("/return")
    ResponseEntity<CharterResponse> returnForChanges(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody ReturnCharterRequest body) {
        return withETag(charters.returnForChanges(projectId, body.comment()));
    }

    @GetMapping("/versions")
    List<CharterResponse> versions(@PathVariable("projectId") UUID projectId) {
        return responses.charters(charters.versions(projectId));
    }

    private CharterContent content(CharterContentRequest body) {
        return new CharterContent(
                body.purpose(),
                body.businessCase(),
                body.objectives() == null
                        ? null
                        : body.objectives().stream()
                                .map(objective -> new CharterObjective(objective.text(), objective.successMetric()))
                                .toList(),
                body.inScope(),
                body.outOfScope(),
                body.assumptions(),
                body.constraints(),
                body.highLevelRisks(),
                body.milestones() == null
                        ? null
                        : body.milestones().stream()
                                .map(milestone -> new CharterMilestone(milestone.name(), milestone.targetDate()))
                                .toList(),
                body.summaryBudget() == null ? null : body.summaryBudget().toMoney("summaryBudget", currency.current()),
                body.sponsorId());
    }

    private ResponseEntity<CharterResponse> withETag(Charter charter) {
        return ResponseEntity.ok().eTag(EntityTags.of(charter.getVersion())).body(responses.charter(charter));
    }
}
