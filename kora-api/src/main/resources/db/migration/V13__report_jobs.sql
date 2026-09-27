-- Phase 9 (feature 21): report export jobs. The files live in object storage (storage_key); a job row is kept as
-- long as its file, 7 days.
CREATE TABLE report_jobs
(
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    requested_by    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type            varchar(20)  NOT NULL,
    format          varchar(5)   NOT NULL,
    -- The report's parameters; no foreign keys: a report outlives nothing, and a deleted project just fails it.
    project_id      uuid,
    portfolio_id    uuid,
    date_from       date,
    date_to         date,
    locale          varchar(5)   NOT NULL,
    status          varchar(7)   NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'READY', 'FAILED')),
    file_name       varchar(200),
    storage_key     varchar(200) UNIQUE,
    content_type    varchar(100),
    size_bytes      bigint,
    failure_reason  varchar(300),
    created_at      timestamptz  NOT NULL,
    started_at      timestamptz,
    completed_at    timestamptz,
    expires_at      timestamptz  NOT NULL
);

CREATE INDEX report_jobs_requester_idx ON report_jobs (organization_id, requested_by, created_at DESC);
CREATE INDEX report_jobs_expiry_idx ON report_jobs (expires_at);

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report_jobs
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
