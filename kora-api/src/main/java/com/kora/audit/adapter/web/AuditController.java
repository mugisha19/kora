package com.kora.audit.adapter.web;

import com.kora.audit.adapter.web.AuditResponses.ActivityEntryResponse;
import com.kora.audit.adapter.web.AuditResponses.AuditEventResponse;
import com.kora.audit.application.AuditService;
import com.kora.audit.application.AuditService.Page;
import com.kora.audit.application.AuditService.Verification;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tags {@code Audit} (feature 19) and {@code Activity} (feature 18). */
@RestController
class AuditController {

    private final AuditService audit;
    private final AuditResponses responses;

    AuditController(AuditService audit, AuditResponses responses) {
        this.audit = audit;
        this.responses = responses;
    }

    record AuditPageResponse(List<AuditEventResponse> items, String nextCursor) {}

    record ActivityPageResponse(List<ActivityEntryResponse> items, String nextCursor) {}

    record VerificationResponse(boolean valid, int checked, UUID firstBrokenId) {}

    @GetMapping("/api/v1/audit")
    AuditPageResponse log(
            @RequestParam(name = "actorId", required = false) UUID actorId,
            @RequestParam(name = "entityType", required = false) @Size(max = 100) String entityType,
            @RequestParam(name = "entityId", required = false) UUID entityId,
            @RequestParam(name = "action", required = false) @Size(max = 100) String action,
            @RequestParam(name = "from", required = false) LocalDate from,
            @RequestParam(name = "to", required = false) LocalDate to,
            @RequestParam(name = "cursor", required = false) @Size(max = 200) String cursor,
            @RequestParam(name = "limit", defaultValue = "20") @Min(1) @Max(100) int limit) {
        Page page = audit.log(actorId, entityType, entityId, action, from, to, cursor, limit);
        return new AuditPageResponse(responses.events(page.items()), page.nextCursor());
    }

    @GetMapping("/api/v1/audit/verify")
    VerificationResponse verify(
            @RequestParam(name = "from", required = false) LocalDate from,
            @RequestParam(name = "to", required = false) LocalDate to) {
        Verification result = audit.verify(from, to);
        return new VerificationResponse(result.valid(), result.checked(), result.firstBrokenId());
    }

    @GetMapping("/api/v1/history/{entityType}/{entityId}")
    List<AuditEventResponse> history(
            @PathVariable("entityType") @Pattern(regexp = "[a-z][a-z-]{1,40}") String entityType,
            @PathVariable("entityId") UUID entityId) {
        return responses.events(audit.history(entityType, entityId));
    }

    @GetMapping("/api/v1/projects/{projectId}/activity")
    ActivityPageResponse activity(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "cursor", required = false) @Size(max = 200) String cursor,
            @RequestParam(name = "limit", defaultValue = "20") @Min(1) @Max(100) int limit) {
        Page page = audit.activity(projectId, cursor, limit);
        return new ActivityPageResponse(responses.activity(page.items()), page.nextCursor());
    }
}
