package com.kora.portfolio.adapter.web;

import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.CreatePortfolioRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.CreateProgramRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.PortfolioResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.ProgramResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.UpdatePortfolioRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.UpdateProgramRequest;
import com.kora.portfolio.application.PortfolioRepositories.PortfolioSearch;
import com.kora.portfolio.application.PortfolioService;
import com.kora.portfolio.application.PortfolioService.PortfolioChanges;
import com.kora.portfolio.application.PortfolioService.PortfolioView;
import com.kora.portfolio.application.ProgramService;
import com.kora.portfolio.application.ProgramService.ProgramChanges;
import com.kora.portfolio.application.ProgramService.ProgramView;
import com.kora.portfolio.domain.Portfolio;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Portfolios}: portfolios and their programs. */
@RestController
class PortfoliosController {

    private final PortfolioService portfolios;
    private final ProgramService programs;
    private final PortfolioResponses responses;

    PortfoliosController(PortfolioService portfolios, ProgramService programs, PortfolioResponses responses) {
        this.portfolios = portfolios;
        this.programs = programs;
        this.responses = responses;
    }

    @GetMapping("/api/v1/portfolios")
    PageResponse<PortfolioResponse> list(
            @RequestParam(name = "status", required = false) Portfolio.Status status,
            @RequestParam(name = "q", required = false) @Size(max = 100) String q,
            Pageable pageable) {
        Page<PortfolioView> page = portfolios.list(new PortfolioSearch(status, q), pageable);
        List<PortfolioResponse> content = responses.portfolios(page.getContent());
        return PageResponse.from(new PageImpl<>(content, page.getPageable(), page.getTotalElements()));
    }

    @PostMapping("/api/v1/portfolios")
    ResponseEntity<PortfolioResponse> create(@Valid @RequestBody CreatePortfolioRequest body) {
        PortfolioView view =
                portfolios.create(body.name(), body.description(), body.strategicObjectives(), body.ownerId());
        return ResponseEntity.created(
                        URI.create("/api/v1/portfolios/" + view.portfolio().getId()))
                .eTag(EntityTags.of(view.portfolio().getVersion()))
                .body(responses.portfolio(view));
    }

    @GetMapping("/api/v1/portfolios/{portfolioId}")
    ResponseEntity<PortfolioResponse> get(@PathVariable("portfolioId") UUID portfolioId) {
        return withETag(portfolios.get(portfolioId));
    }

    @PatchMapping("/api/v1/portfolios/{portfolioId}")
    ResponseEntity<PortfolioResponse> update(
            @PathVariable("portfolioId") UUID portfolioId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdatePortfolioRequest body) {
        PortfolioChanges changes = new PortfolioChanges(
                body.name(), body.description(), body.strategicObjectives(), body.ownerId(), body.status());
        return withETag(portfolios.update(portfolioId, expectedVersion, changes));
    }

    @DeleteMapping("/api/v1/portfolios/{portfolioId}")
    ResponseEntity<Void> delete(@PathVariable("portfolioId") UUID portfolioId) {
        portfolios.delete(portfolioId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/portfolios/{portfolioId}/programs")
    List<ProgramResponse> programs(@PathVariable("portfolioId") UUID portfolioId) {
        return responses.programs(programs.list(portfolioId));
    }

    @PostMapping("/api/v1/portfolios/{portfolioId}/programs")
    ResponseEntity<ProgramResponse> createProgram(
            @PathVariable("portfolioId") UUID portfolioId, @Valid @RequestBody CreateProgramRequest body) {
        ProgramView view = programs.create(portfolioId, body.name(), body.description(), body.managerId());
        return ResponseEntity.created(
                        URI.create("/api/v1/programs/" + view.program().getId()))
                .eTag(EntityTags.of(view.program().getVersion()))
                .body(responses.program(view));
    }

    @GetMapping("/api/v1/programs/{programId}")
    ResponseEntity<ProgramResponse> program(@PathVariable("programId") UUID programId) {
        return programWithETag(programs.get(programId));
    }

    @PatchMapping("/api/v1/programs/{programId}")
    ResponseEntity<ProgramResponse> updateProgram(
            @PathVariable("programId") UUID programId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateProgramRequest body) {
        ProgramChanges changes = new ProgramChanges(body.name(), body.description(), body.managerId(), body.status());
        return programWithETag(programs.update(programId, expectedVersion, changes));
    }

    private ResponseEntity<PortfolioResponse> withETag(PortfolioView view) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(view.portfolio().getVersion()))
                .body(responses.portfolio(view));
    }

    private ResponseEntity<ProgramResponse> programWithETag(ProgramView view) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(view.program().getVersion()))
                .body(responses.program(view));
    }
}
