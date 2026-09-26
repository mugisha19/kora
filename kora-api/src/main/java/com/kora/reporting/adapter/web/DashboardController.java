package com.kora.reporting.adapter.web;

import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.PageResponse;
import com.kora.platform.web.UserRefJson;
import com.kora.portfolio.Health;
import com.kora.reporting.application.DashboardService;
import com.kora.reporting.application.DashboardService.Summary;
import com.kora.reporting.domain.ProjectSnapshot;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Dashboard} (feature 05). */
@RestController
@RequestMapping("/api/v1/dashboard")
class DashboardController {

    private final DashboardService dashboard;
    private final MemberDirectory members;

    DashboardController(DashboardService dashboard, MemberDirectory members) {
        this.dashboard = dashboard;
        this.members = members;
    }

    /** Figures from later phases (SPI, CPI, risks, change requests) are absent rather than null or zero. */
    record DashboardSummaryResponse(
            int projectCount,
            Map<String, Integer> byStatus,
            Map<Health, Integer> byHealth,
            MoneyJson totalBudget,
            MoneyJson totalPlannedCost,
            MoneyJson totalEarnedValue,
            int lateProjects) {}

    record NextMilestone(String name, LocalDate targetDate) {}

    record DashboardProjectResponse(
            UUID projectId,
            String code,
            String name,
            UUID portfolioId,
            UserRefJson manager,
            String status,
            Health health,
            String healthReason,
            boolean healthOverridden,
            BigDecimal percentComplete,
            LocalDate targetEndDate,
            NextMilestone nextMilestone) {}

    @GetMapping("/summary")
    DashboardSummaryResponse summary(@RequestParam(name = "portfolioId", required = false) UUID portfolioId) {
        Summary summary = dashboard.summary(portfolioId);
        return new DashboardSummaryResponse(
                summary.projectCount(),
                summary.byStatus(),
                summary.byHealth(),
                MoneyJson.from(summary.totalBudget()),
                MoneyJson.from(summary.totalPlannedCost()),
                MoneyJson.from(summary.totalEarnedValue()),
                summary.lateProjects());
    }

    @GetMapping("/projects")
    PageResponse<DashboardProjectResponse> projects(
            @RequestParam(name = "portfolioId", required = false) UUID portfolioId,
            @RequestParam(name = "health", required = false) Health health,
            Pageable pageable) {
        Page<ProjectSnapshot> page = dashboard.projects(portfolioId, health, pageable);
        Map<UUID, MemberSummary> managers = members.findAll(
                page.getContent().stream().map(ProjectSnapshot::getManagerId).toList());
        List<DashboardProjectResponse> rows =
                page.getContent().stream().map(row -> row(row, managers)).toList();
        return PageResponse.from(new PageImpl<>(rows, page.getPageable(), page.getTotalElements()));
    }

    private static DashboardProjectResponse row(ProjectSnapshot row, Map<UUID, MemberSummary> managers) {
        MemberSummary manager = managers.get(row.getManagerId());
        return new DashboardProjectResponse(
                row.getProjectId(),
                row.getCode(),
                row.getName(),
                row.getPortfolioId(),
                new UserRefJson(row.getManagerId(), manager == null ? "Former member" : manager.fullName()),
                row.getStatus(),
                row.getHealth(),
                row.getHealthReason(),
                row.isHealthOverridden(),
                row.getPercentComplete(),
                row.getTargetEndDate(),
                row.getNextMilestoneName() == null
                        ? null
                        : new NextMilestone(row.getNextMilestoneName(), row.getNextMilestoneDate()));
    }
}
