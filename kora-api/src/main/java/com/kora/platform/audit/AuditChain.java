package com.kora.platform.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stores audit records as a hash chain per organization (feature 19): each entry's hash covers its content and the
 * previous entry's hash, so changing or removing any stored entry breaks every hash after it. Writers of one
 * organization take turns (a transaction-scoped advisory lock), which keeps the chain a single line.
 *
 * <p>Plain JDBC on the transaction's own connection: the row-level security role and tenant set for the transaction
 * still apply, and no entity events fire while the trail is written.
 */
public final class AuditChain {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private AuditChain() {}

    public static List<StoredAuditEvent> append(Connection connection, List<AuditRecord> records) throws SQLException {
        List<StoredAuditEvent> stored = new ArrayList<>(records.size());
        for (AuditRecord record : records) {
            stored.add(append(connection, record));
        }
        return stored;
    }

    /**
     * Changes outside any organization (a user's own profile or preferences) belong to the system chain, which only
     * the system scope may write. They are recorded in the same transaction as the change, so the scope is raised for
     * this one insert and put back straight after.
     */
    private static StoredAuditEvent append(Connection connection, AuditRecord record) throws SQLException {
        if (record.organizationId() == null) {
            String scope = currentScope(connection);
            setScope(connection, "system");
            try {
                return appendToChain(connection, record);
            } finally {
                setScope(connection, scope == null ? "" : scope);
            }
        }
        return appendToChain(connection, record);
    }

    private static String currentScope(Connection connection) throws SQLException {
        try (PreparedStatement current = connection.prepareStatement("SELECT current_setting('app.org', true)");
                ResultSet rows = current.executeQuery()) {
            return rows.next() ? rows.getString(1) : null;
        }
    }

    private static void setScope(Connection connection, String scope) throws SQLException {
        try (PreparedStatement set = connection.prepareStatement("SELECT set_config('app.org', ?, true)")) {
            set.setString(1, scope);
            set.execute();
        }
    }

    private static StoredAuditEvent appendToChain(Connection connection, AuditRecord record) throws SQLException {
        String chain = record.organizationId() == null
                ? "system"
                : record.organizationId().toString();
        try (PreparedStatement lock =
                connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
            lock.setString(1, "audit:" + chain);
            lock.execute();
        }
        String previousHash = null;
        long position = 1;
        try (PreparedStatement last = connection.prepareStatement("""
                SELECT hash, chain_position FROM audit_events
                WHERE organization_id IS NOT DISTINCT FROM ?
                ORDER BY chain_position DESC LIMIT 1
                """)) {
            last.setObject(1, record.organizationId(), Types.OTHER);
            try (ResultSet rows = last.executeQuery()) {
                if (rows.next()) {
                    previousHash = rows.getString(1);
                    position = rows.getLong(2) + 1;
                }
            }
        }
        UUID id = UUID.randomUUID();
        String changes = JSON.writeValueAsString(record.changes());
        String hash = hash(previousHash, id, record, changes);
        try (PreparedStatement insert = connection.prepareStatement("""
                INSERT INTO audit_events (id, organization_id, chain_position, occurred_at, actor_id, actor_ip, user_agent,
                    correlation_id, action, entity_type, entity_id, entity_label, project_id, outcome, changes,
                    previous_hash, hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
            insert.setObject(1, id);
            insert.setObject(2, record.organizationId(), Types.OTHER);
            insert.setLong(3, position);
            insert.setTimestamp(4, Timestamp.from(record.occurredAt()));
            insert.setObject(5, record.actorId(), Types.OTHER);
            insert.setString(6, record.actorIp());
            insert.setString(7, record.userAgent());
            insert.setString(8, record.correlationId());
            insert.setString(9, record.action());
            insert.setString(10, record.entityType());
            insert.setObject(11, record.entityId(), Types.OTHER);
            insert.setString(12, record.entityLabel());
            insert.setObject(13, record.projectId(), Types.OTHER);
            insert.setString(14, record.outcome().name());
            insert.setString(15, changes);
            insert.setString(16, previousHash);
            insert.setString(17, hash);
            insert.executeUpdate();
        }
        return new StoredAuditEvent(id, position, hash, record);
    }

    /**
     * SHA-256 over the previous hash and the entry's stored fields. The timestamp is in microseconds, as PostgreSQL
     * stores it, so a stored entry hashes the same when verified.
     */
    public static String hash(String previousHash, UUID id, AuditRecord record, String changes) {
        String content = String.join(
                "|",
                String.valueOf(previousHash),
                id.toString(),
                String.valueOf(record.organizationId()),
                String.valueOf(record.occurredAt()),
                String.valueOf(record.actorId()),
                record.action(),
                record.entityType(),
                String.valueOf(record.entityId()),
                record.outcome().name(),
                changes);
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha256.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("Every JVM provides SHA-256", impossible);
        }
    }
}
