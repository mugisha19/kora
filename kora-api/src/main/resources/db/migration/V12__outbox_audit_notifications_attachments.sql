-- Phase 8 (features 18–20): the transactional outbox, the audit trail, notifications and attachments.

-- Spring Modulith's event publication registry: events are stored with the change that caused them and completed
-- once every listener has handled them (at-least-once delivery, ADR 0013). Not tenant data: events carry their
-- organization, and listeners bind it themselves.
CREATE TABLE event_publication
(
    id                     uuid                     NOT NULL PRIMARY KEY,
    listener_id            text                     NOT NULL,
    event_type             text                     NOT NULL,
    serialized_event       text                     NOT NULL,
    publication_date       timestamp with time zone NOT NULL,
    completion_date        timestamp with time zone,
    status                 varchar(16),
    completion_attempts    integer                  NOT NULL DEFAULT 0,
    last_resubmission_date timestamp with time zone
);

CREATE INDEX event_publication_completion_idx ON event_publication (completion_date);

-- The audit trail: append-only, hash-chained per organization. Security events before an organization is chosen
-- (signing in) have no organization and are only visible in the system scope.
CREATE TABLE audit_events
(
    id              uuid PRIMARY KEY,
    organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
    chain_position  bigint       NOT NULL,
    occurred_at     timestamptz  NOT NULL,
    actor_id        uuid,
    actor_ip        varchar(45),
    user_agent      varchar(300),
    correlation_id  varchar(64),
    action          varchar(80)  NOT NULL,
    entity_type     varchar(40)  NOT NULL,
    entity_id       uuid,
    entity_label    varchar(200),
    project_id      uuid,
    outcome         varchar(7)   NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED')),
    changes         text         NOT NULL,
    previous_hash   varchar(64),
    hash            varchar(64)  NOT NULL
);

CREATE UNIQUE INDEX audit_events_chain_idx ON audit_events (organization_id, chain_position);
CREATE INDEX audit_events_entity_idx ON audit_events (organization_id, entity_type, entity_id, occurred_at);
CREATE INDEX audit_events_project_idx ON audit_events (organization_id, project_id, occurred_at);
CREATE INDEX audit_events_occurred_idx ON audit_events (organization_id, occurred_at);

-- The application may add and read audit rows, never change or remove them.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM kora_app;

CREATE TABLE notifications
(
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type            varchar(30)  NOT NULL,
    title_key       varchar(100) NOT NULL,
    params          text         NOT NULL,
    link            varchar(300),
    event_key       varchar(200) NOT NULL,
    read_at         timestamptz,
    created_at      timestamptz  NOT NULL,
    -- A redelivered event (at-least-once) must not notify twice.
    UNIQUE (organization_id, user_id, event_key)
);

CREATE INDEX notifications_user_idx ON notifications (organization_id, user_id, created_at DESC);

-- Per person, across organizations, like the user account itself.
CREATE TABLE notification_preferences
(
    user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type    varchar(30) NOT NULL,
    in_app  boolean     NOT NULL,
    email   boolean     NOT NULL,
    PRIMARY KEY (user_id, type)
);

CREATE TABLE attachments
(
    id                    uuid PRIMARY KEY,
    organization_id       uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    owner_type            varchar(14)  NOT NULL,
    owner_id              uuid         NOT NULL,
    project_id            uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    file_name             varchar(200) NOT NULL,
    declared_content_type varchar(100) NOT NULL,
    content_type          varchar(100),
    size_bytes            bigint       NOT NULL,
    sha256                varchar(64),
    storage_key           varchar(200) NOT NULL UNIQUE,
    status                varchar(9)   NOT NULL CHECK (status IN ('PENDING', 'AVAILABLE')),
    scan_status           varchar(11)  NOT NULL,
    uploaded_by           uuid         NOT NULL REFERENCES users (id),
    uploaded_at           timestamptz  NOT NULL,
    completed_at          timestamptz,
    deleted_at            timestamptz
);

CREATE INDEX attachments_owner_idx ON attachments (organization_id, owner_type, owner_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attachments
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
