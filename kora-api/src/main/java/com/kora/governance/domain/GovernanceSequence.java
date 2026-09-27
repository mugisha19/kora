package com.kora.governance.domain;

import com.kora.platform.audit.NotAudited;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * The last number handed out per project and kind (risks, issues, change requests), read under a row lock so two
 * items raised at the same moment never share a key.
 *
 * <p>Not audited: a counter; the records it numbers are audited.
 */
@NotAudited
@Entity
@Table(name = "governance_sequences")
@IdClass(GovernanceSequence.Key.class)
public class GovernanceSequence {

    /** The letters in keys like {@code AKG-12-R3}. */
    public enum Kind {
        R,
        I,
        CR
    }

    public record Key(UUID projectId, String kind) implements Serializable {}

    @Id
    @Column(name = "project_id")
    private UUID projectId;

    @Id
    private String kind;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "last_number", nullable = false)
    private int lastNumber;

    protected GovernanceSequence() {
        // for JPA
    }

    public int next() {
        return ++lastNumber;
    }

    /** {@code projectCode-R3}: the project code, the kind's letters and the number. */
    public static String key(String projectCode, Kind kind, int number) {
        return projectCode + "-" + kind.name() + number;
    }
}
