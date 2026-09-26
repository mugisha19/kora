-- Reporting module (feature 05): one denormalized row per project, refreshed in the same transaction as every
-- change to the project, its charter or its WBS (and hourly for time-based rules), so the dashboard reads one table
-- instead of aggregating across modules on every request (ADR 0008).

CREATE TABLE project_snapshots
(
    project_id           uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    organization_id      uuid           NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    portfolio_id         uuid           NOT NULL,
    program_id           uuid,
    code                 varchar(15)    NOT NULL,
    name                 varchar(150)   NOT NULL,
    manager_id           uuid           NOT NULL,
    status               varchar(12)    NOT NULL,
    methodology          varchar(12)    NOT NULL,
    start_date           date           NOT NULL,
    target_end_date      date           NOT NULL,
    currency             varchar(3)     NOT NULL,
    budget_amount        numeric(19, 4),
    planned_cost_amount  numeric(19, 4) NOT NULL,
    earned_value_amount  numeric(19, 4) NOT NULL,
    percent_complete     numeric(5, 2)  NOT NULL,
    next_milestone_name  varchar(200),
    next_milestone_date  date,
    health               varchar(5)     NOT NULL,
    health_reason        varchar(500),
    health_overridden    boolean        NOT NULL,
    -- Default "needs attention" order: RED 0, AMBER 1, GREY 2, GREEN 3.
    severity             integer        NOT NULL,
    late                 boolean        NOT NULL,
    refreshed_at         timestamptz    NOT NULL
);

CREATE INDEX project_snapshots_portfolio_idx ON project_snapshots (organization_id, portfolio_id);
CREATE INDEX project_snapshots_attention_idx ON project_snapshots (organization_id, severity, name);

ALTER TABLE project_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_snapshots
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
