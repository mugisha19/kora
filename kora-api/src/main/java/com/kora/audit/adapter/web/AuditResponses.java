package com.kora.audit.adapter.web;

import com.kora.audit.domain.AuditEntry;
import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.platform.audit.AuditRecord;
import com.kora.platform.web.UserRefJson;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Audit entries and activity as the contract shows them, with actors named in one lookup. */
@Component
class AuditResponses {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<Map<String, Map<String, Object>>> CHANGES = new TypeReference<>() {};

    private final MemberDirectory members;
    private final UserAccounts accounts;

    AuditResponses(MemberDirectory members, UserAccounts accounts) {
        this.members = members;
        this.accounts = accounts;
    }

    record AuditEventResponse(
            UUID id,
            Instant occurredAt,
            UserRefJson actor,
            String actorIp,
            String userAgent,
            String correlationId,
            String action,
            String entityType,
            UUID entityId,
            String entityLabel,
            UUID projectId,
            AuditRecord.Outcome outcome,
            Map<String, Map<String, Object>> changes) {}

    record ActivityEntryResponse(
            UUID id,
            Instant occurredAt,
            UserRefJson actor,
            String action,
            String entityType,
            UUID entityId,
            String entityLabel,
            List<String> changedFields) {}

    List<AuditEventResponse> events(List<AuditEntry> entries) {
        Map<UUID, String> names =
                names(entries.stream().map(AuditEntry::getActorId).toList());
        return entries.stream()
                .map(entry -> new AuditEventResponse(
                        entry.getId(),
                        entry.getOccurredAt(),
                        ref(entry.getActorId(), names),
                        entry.getActorIp(),
                        entry.getUserAgent(),
                        entry.getCorrelationId(),
                        entry.getAction(),
                        entry.getEntityType(),
                        entry.getEntityId(),
                        entry.getEntityLabel(),
                        entry.getProjectId(),
                        entry.getOutcome(),
                        changes(entry.getChanges())))
                .toList();
    }

    List<ActivityEntryResponse> activity(List<AuditEntry> entries) {
        Map<UUID, String> names =
                names(entries.stream().map(AuditEntry::getActorId).toList());
        return entries.stream()
                .map(entry -> activity(
                        entry.getId(),
                        entry.getOccurredAt(),
                        ref(entry.getActorId(), names),
                        entry.getAction(),
                        entry.getEntityType(),
                        entry.getEntityId(),
                        entry.getEntityLabel(),
                        changes(entry.getChanges()).keySet()))
                .toList();
    }

    static ActivityEntryResponse activity(
            UUID id,
            Instant occurredAt,
            UserRefJson actor,
            String action,
            String entityType,
            UUID entityId,
            String entityLabel,
            Collection<String> changedFields) {
        return new ActivityEntryResponse(
                id, occurredAt, actor, action, entityType, entityId, entityLabel, List.copyOf(changedFields));
    }

    UserRefJson actor(UUID userId) {
        return ref(userId, names(List.of(userId)));
    }

    private static Map<String, Map<String, Object>> changes(String json) {
        return JSON.readValue(json, CHANGES);
    }

    private static UserRefJson ref(UUID userId, Map<UUID, String> names) {
        return userId == null ? null : new UserRefJson(userId, names.get(userId));
    }

    private Map<UUID, String> names(Collection<UUID> userIds) {
        List<UUID> ids = userIds.stream().filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> names = new HashMap<>();
        members.findAll(ids).forEach((id, member) -> names.put(id, member.fullName()));
        ids.forEach(
                id -> names.computeIfAbsent(id, missing -> accounts.get(missing).fullName()));
        return names;
    }
}
