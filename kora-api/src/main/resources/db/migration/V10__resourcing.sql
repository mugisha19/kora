-- Resourcing module (features 15–16): cost rates, timesheets and time entries, capacity, leave and allocations.

-- A person's hourly cost from a date on; hours are costed at the rate valid on the day they were worked.
CREATE TABLE cost_rates
(
    id                 uuid PRIMARY KEY,
    organization_id    uuid           NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id            uuid           NOT NULL REFERENCES users (id),
    hourly_rate_amount numeric(19, 4) NOT NULL CHECK (hourly_rate_amount >= 0),
    currency           varchar(3)     NOT NULL,
    valid_from         date           NOT NULL,
    created_at         timestamptz    NOT NULL,
    UNIQUE (organization_id, user_id, valid_from)
);

-- One person's week on one project: each project's managers approve their own part of a week.
CREATE TABLE timesheets
(
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES users (id),
    project_id      uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    week_start      date        NOT NULL CHECK (extract(isodow FROM week_start) = 1),
    status          varchar(9)  NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
    submitted_at    timestamptz,
    decided_by      uuid REFERENCES users (id),
    decided_at      timestamptz,
    comment         varchar(1000),
    version         bigint      NOT NULL,
    UNIQUE (user_id, project_id, week_start)
);

CREATE INDEX timesheets_project_idx ON timesheets (organization_id, project_id, status, week_start);

-- The task's key and title are kept, so logged time (and its cost) outlives a deleted task.
CREATE TABLE time_entries
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    timesheet_id    uuid          NOT NULL REFERENCES timesheets (id) ON DELETE CASCADE,
    user_id         uuid          NOT NULL REFERENCES users (id),
    project_id      uuid          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id         uuid REFERENCES tasks (id) ON DELETE SET NULL,
    task_key        varchar(40)   NOT NULL,
    task_title      varchar(200)  NOT NULL,
    work_date       date          NOT NULL,
    hours           numeric(4, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    note            varchar(500),
    billable        boolean       NOT NULL
);

CREATE INDEX time_entries_user_date_idx ON time_entries (organization_id, user_id, work_date);
CREATE INDEX time_entries_project_idx ON time_entries (organization_id, project_id, work_date);

CREATE TABLE capacities
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid          NOT NULL REFERENCES users (id),
    hours_per_week  numeric(5, 2) NOT NULL CHECK (hours_per_week BETWEEN 0 AND 80),
    valid_from      date          NOT NULL,
    UNIQUE (organization_id, user_id, valid_from)
);

CREATE TABLE leaves
(
    id              uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id),
    from_date       date NOT NULL,
    to_date         date NOT NULL CHECK (to_date >= from_date),
    reason          varchar(200)
);

CREATE INDEX leaves_user_idx ON leaves (organization_id, user_id, from_date);

CREATE TABLE allocations
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id         uuid          NOT NULL REFERENCES users (id),
    week_start      date          NOT NULL CHECK (extract(isodow FROM week_start) = 1),
    hours           numeric(6, 2) NOT NULL CHECK (hours > 0 AND hours <= 168),
    UNIQUE (project_id, user_id, week_start)
);

CREATE INDEX allocations_user_week_idx ON allocations (organization_id, user_id, week_start);

ALTER TABLE cost_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cost_rates
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON timesheets
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON time_entries
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE capacities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON capacities
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON leaves
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON allocations
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
