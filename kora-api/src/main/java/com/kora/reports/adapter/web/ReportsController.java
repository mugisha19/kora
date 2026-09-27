package com.kora.reports.adapter.web;

import com.kora.reports.ReportFormat;
import com.kora.reports.ReportParams;
import com.kora.reports.ReportType;
import com.kora.reports.application.ReportService;
import com.kora.reports.application.ReportService.JobView;
import com.kora.reports.domain.ReportJob;
import com.kora.reports.domain.ReportStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Reports} (feature 21). */
@RestController
class ReportsController {

    private final ReportService reports;

    ReportsController(ReportService reports) {
        this.reports = reports;
    }

    record ParamsBody(UUID projectId, UUID portfolioId, LocalDate from, LocalDate to) {

        ReportParams toParams() {
            return new ReportParams(projectId, portfolioId, from, to);
        }

        static ParamsBody of(ReportParams params) {
            return new ParamsBody(params.projectId(), params.portfolioId(), params.from(), params.to());
        }
    }

    record CreateReportRequest(
            @NotNull ReportType type,
            @NotNull ReportFormat format,
            @Valid ParamsBody params) {}

    record ReportJobResponse(
            UUID id,
            ReportType type,
            ReportFormat format,
            ParamsBody params,
            ReportStatus status,
            String fileName,
            Long sizeBytes,
            Instant createdAt,
            Instant completedAt,
            Instant expiresAt,
            String downloadUrl,
            Instant downloadExpiresAt,
            String failureReason) {}

    @PostMapping("/api/v1/reports")
    ResponseEntity<ReportJobResponse> request(@Valid @RequestBody CreateReportRequest request) {
        ReportJob job = reports.request(
                request.type(),
                request.format(),
                request.params() == null ? null : request.params().toParams());
        return ResponseEntity.accepted()
                .location(URI.create("/api/v1/reports/" + job.getId()))
                .body(response(reports.view(job)));
    }

    @GetMapping("/api/v1/reports")
    List<ReportJobResponse> mine() {
        // No links in the list: each costs a signature, and the client asks for one job when it downloads.
        return reports.mine().stream()
                .map(job -> response(new JobView(job, null, null)))
                .toList();
    }

    @GetMapping("/api/v1/reports/{reportId}")
    ReportJobResponse get(@PathVariable("reportId") UUID reportId) {
        return response(reports.get(reportId));
    }

    private static ReportJobResponse response(JobView view) {
        ReportJob job = view.job();
        return new ReportJobResponse(
                job.getId(),
                job.getType(),
                job.getFormat(),
                ParamsBody.of(job.params()),
                job.getStatus(),
                job.getFileName(),
                job.getSizeBytes(),
                job.getCreatedAt(),
                job.getCompletedAt(),
                job.getExpiresAt(),
                view.downloadUrl() == null ? null : view.downloadUrl().toString(),
                view.downloadExpiresAt(),
                job.getFailureReason());
    }
}
