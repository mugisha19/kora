-- Schedule module (feature 10): task durations and constraints, dependencies, baselines and the working calendar.
-- The schedule itself (early/late dates, float) is computed on request and never stored (ADR 0010).

ALTER TABLE tasks
    ADD COLUMN duration_days       integer CHECK (duration_days BETWEEN 0 AND 1000),
    ADD COLUMN schedule_constraint varchar(22) NOT NULL DEFAULT 'ASAP'
        CHECK (schedule_constraint IN ('ASAP', 'START_NO_EARLIER_THAN')),
    ADD COLUMN constraint_date     date,
    ADD CONSTRAINT tasks_constraint_date_check
        CHECK ((schedule_constraint = 'ASAP') = (constraint_date IS NULL));

CREATE TABLE task_dependencies
(
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    predecessor_id  uuid        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    successor_id    uuid        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    type            varchar(2)  NOT NULL CHECK (type IN ('FS', 'SS', 'FF', 'SF')),
    lag_days        integer     NOT NULL CHECK (lag_days BETWEEN -365 AND 365),
    created_at      timestamptz NOT NULL,
    CHECK (predecessor_id <> successor_id),
    UNIQUE (predecessor_id, successor_id)
);

CREATE INDEX task_dependencies_project_idx ON task_dependencies (organization_id, project_id);
CREATE INDEX task_dependencies_successor_idx ON task_dependencies (successor_id);

CREATE TABLE schedule_baselines
(
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    number          integer     NOT NULL,
    saved_at        timestamptz NOT NULL,
    saved_by        uuid        NOT NULL REFERENCES users (id),
    task_count      integer     NOT NULL,
    UNIQUE (project_id, number)
);

CREATE TABLE baseline_tasks
(
    id              uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    baseline_id     uuid NOT NULL REFERENCES schedule_baselines (id) ON DELETE CASCADE,
    task_id         uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    start_date      date NOT NULL,
    finish_date     date NOT NULL,
    UNIQUE (baseline_id, task_id)
);

-- One row per organization once an administrator changes it; until then Monday to Friday, no holidays.
CREATE TABLE working_calendars
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE CASCADE,
    working_days    varchar(100)  NOT NULL,
    holidays        varchar(20000) NOT NULL,
    version         bigint        NOT NULL
);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_dependencies
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE schedule_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON schedule_baselines
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE baseline_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON baseline_tasks
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE working_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON working_calendars
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
