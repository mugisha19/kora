package com.kora.platform.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AuditChainTest {

    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String CHANGES = "{\"title\":{\"before\":\"A\",\"after\":\"B\"}}";

    @Test
    void theHashIsStableForTheSameContent() {
        assertThat(AuditChain.hash("prev", ID, record("task.updated"), CHANGES))
                .isEqualTo(AuditChain.hash("prev", ID, record("task.updated"), CHANGES))
                .hasSize(64);
    }

    @Test
    void anyEditOrReLinkingChangesTheHash() {
        String original = AuditChain.hash("prev", ID, record("task.updated"), CHANGES);

        assertThat(AuditChain.hash("prev", ID, record("task.viewed"), CHANGES)).isNotEqualTo(original);
        assertThat(AuditChain.hash("prev", ID, record("task.updated"), "{}")).isNotEqualTo(original);
        assertThat(AuditChain.hash("other", ID, record("task.updated"), CHANGES))
                .isNotEqualTo(original);
        assertThat(AuditChain.hash(null, ID, record("task.updated"), CHANGES)).isNotEqualTo(original);
    }

    private static AuditRecord record(String action) {
        return new AuditRecord(
                UUID.fromString("00000000-0000-0000-0000-00000000000a"),
                Instant.parse("2026-09-27T10:00:00.123456Z"),
                UUID.fromString("00000000-0000-0000-0000-00000000000b"),
                "10.0.0.0",
                "JUnit",
                "c-1",
                action,
                "task",
                UUID.fromString("00000000-0000-0000-0000-00000000000c"),
                "T-1",
                null,
                AuditRecord.Outcome.SUCCESS,
                Map.of());
    }
}
