package com.kora.performance.adapter.web;

import com.kora.performance.application.EvmService;
import com.kora.performance.application.EvmService.Report;
import com.kora.performance.application.EvmService.Series;
import com.kora.performance.domain.EacMethod;
import com.kora.performance.domain.EarnedValueAnalysis;
import com.kora.performance.domain.EvmSettings;
import com.kora.performance.domain.PercentCompleteMethod;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.MoneyJson;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code EarnedValue} (feature 17). */
@RestController
class EvmController {

    private final EvmService evm;

    EvmController(EvmService evm) {
        this.evm = evm;
    }

    record UnavailableResponse(String metric, String reason) {}

    record EvmReportResponse(
            UUID projectId,
            LocalDate asOf,
            PercentCompleteMethod percentCompleteMethod,
            EacMethod eacMethod,
            MoneyJson bac,
            MoneyJson pv,
            MoneyJson ev,
            MoneyJson ac,
            MoneyJson sv,
            MoneyJson cv,
            BigDecimal spi,
            BigDecimal cpi,
            MoneyJson eac,
            MoneyJson etc,
            MoneyJson vac,
            BigDecimal tcpi,
            BigDecimal unratedHours,
            List<UnavailableResponse> unavailable) {}

    record EvmPointResponse(LocalDate weekEnding, MoneyJson pv, MoneyJson ev, MoneyJson ac) {}

    record EvmSeriesResponse(UUID projectId, MoneyJson bac, List<EvmPointResponse> points) {}

    record EvmSettingsResponse(PercentCompleteMethod percentCompleteMethod, EacMethod eacMethod, long version) {}

    record UpdateEvmSettingsRequest(
            @NotNull PercentCompleteMethod percentCompleteMethod,
            @NotNull EacMethod eacMethod) {}

    @GetMapping("/api/v1/projects/{projectId}/evm")
    EvmReportResponse report(@PathVariable("projectId") UUID projectId) {
        Report report = evm.report(projectId);
        EarnedValueAnalysis figures = report.analysis();
        return new EvmReportResponse(
                projectId,
                report.asOf(),
                report.settings().getPercentCompleteMethod(),
                report.settings().getEacMethod(),
                MoneyJson.from(figures.bac()),
                MoneyJson.from(figures.pv()),
                MoneyJson.from(figures.ev()),
                MoneyJson.from(figures.ac()),
                MoneyJson.from(figures.sv()),
                MoneyJson.from(figures.cv()),
                figures.spi(),
                figures.cpi(),
                MoneyJson.from(figures.eac()),
                MoneyJson.from(figures.etc()),
                MoneyJson.from(figures.vac()),
                figures.tcpi(),
                report.unratedHours(),
                figures.unavailable().stream()
                        .map(missing -> new UnavailableResponse(missing.metric(), missing.reason()))
                        .toList());
    }

    @GetMapping("/api/v1/projects/{projectId}/evm/series")
    EvmSeriesResponse series(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "from", required = false) LocalDate from,
            @RequestParam(name = "to", required = false) LocalDate to) {
        Series series = evm.series(projectId, from, to);
        return new EvmSeriesResponse(
                projectId,
                MoneyJson.from(series.bac()),
                series.points().stream()
                        .map(point -> new EvmPointResponse(
                                point.weekEnding(),
                                MoneyJson.from(point.pv()),
                                MoneyJson.from(point.ev()),
                                MoneyJson.from(point.ac())))
                        .toList());
    }

    @GetMapping("/api/v1/projects/{projectId}/evm/settings")
    ResponseEntity<EvmSettingsResponse> settings(@PathVariable("projectId") UUID projectId) {
        return withTag(evm.settings(projectId));
    }

    @PutMapping("/api/v1/projects/{projectId}/evm/settings")
    ResponseEntity<EvmSettingsResponse> choose(
            @PathVariable("projectId") UUID projectId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateEvmSettingsRequest body) {
        return withTag(evm.choose(projectId, expectedVersion, body.percentCompleteMethod(), body.eacMethod()));
    }

    private static ResponseEntity<EvmSettingsResponse> withTag(EvmSettings settings) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(settings.getVersion()))
                .body(new EvmSettingsResponse(
                        settings.getPercentCompleteMethod(), settings.getEacMethod(), settings.getVersion()));
    }
}
