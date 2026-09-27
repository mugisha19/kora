package com.kora.platform.audit;

import java.util.UUID;

/** An audit record as stored: with its id and its place in the organization's hash chain. */
public record StoredAuditEvent(UUID id, long chainPosition, String hash, AuditRecord record) {}
