-- Portfolio module (features 04 and 06): portfolios, programs, projects, project teams and charters.
-- Every table is tenant-owned: organization_id, row-level security, @TenantId on the entity (ADR 0007).

CREATE TABLE portfolios
(
    id                   uuid PRIMARY KEY,
    organization_id      uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name                 varchar(100)  NOT NULL,
    description          varchar(2000),
    -- JSON array of strings (a value list always read with its portfolio).
    strategic_objectives text          NOT NULL DEFAULT '[]',
    owner_id             uuid          NOT NULL REFERENCES users (id),
    status               varchar(10)   NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at           timestamptz   NOT NULL,
    version              bigint        NOT NULL
);

CREATE INDEX portfolios_organization_name_idx ON portfolios (organization_id, name);

CREATE TABLE programs
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    portfolio_id    uuid          NOT NULL REFERENCES portfolios (id),
    name            varchar(100)  NOT NULL,
    description     varchar(2000),
    manager_id      uuid          NOT NULL REFERENCES users (id),
    status          varchar(10)   NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED')),
    created_at      timestamptz   NOT NULL,
    version         bigint        NOT NULL
);

CREATE INDEX programs_portfolio_idx ON programs (organization_id, portfolio_id);

CREATE TABLE projects
(
    id                     uuid PRIMARY KEY,
    organization_id        uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    portfolio_id           uuid          NOT NULL REFERENCES portfolios (id),
    program_id             uuid REFERENCES programs (id),
    code                   varchar(15)   NOT NULL,
    name                   varchar(150)  NOT NULL,
    description            varchar(4000),
    manager_id             uuid          NOT NULL REFERENCES users (id),
    methodology            varchar(12)   NOT NULL CHECK (methodology IN ('AGILE', 'PREDICTIVE', 'HYBRID')),
    status                 varchar(12)   NOT NULL CHECK (status IN
        ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'ON_HOLD', 'CLOSING', 'CLOSED', 'CANCELLED')),
    status_reason          varchar(500),
    start_date             date          NOT NULL,
    target_end_date        date          NOT NULL,
    budget_amount          numeric(19, 4),
    budget_currency        varchar(3),
    -- Written by the reporting module's health rule; excluded from optimistic locking (see Project).
    computed_health        varchar(5)    NOT NULL DEFAULT 'GREY' CHECK (computed_health IN ('GREEN', 'AMBER', 'RED', 'GREY')),
    computed_health_reason varchar(500),
    health_override        varchar(5) CHECK (health_override IN ('GREEN', 'AMBER', 'RED')),
    health_override_reason varchar(500),
    created_at             timestamptz   NOT NULL,
    version                bigint        NOT NULL,
    CONSTRAINT projects_organization_code_key UNIQUE (organization_id, code),
    CONSTRAINT projects_dates_ordered CHECK (target_end_date > start_date),
    CONSTRAINT projects_budget_has_currency CHECK ((budget_amount IS NULL) = (budget_currency IS NULL)),
    CONSTRAINT projects_override_has_reason CHECK ((health_override IS NULL) = (health_override_reason IS NULL))
);

CREATE INDEX projects_portfolio_idx ON projects (organization_id, portfolio_id);
CREATE INDEX projects_status_idx ON projects (organization_id, status);
CREATE INDEX projects_manager_idx ON projects (organization_id, manager_id);

-- The manager is not listed here: it is projects.manager_id, so there is exactly one and it can't drift.
CREATE TABLE project_members
(
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES users (id),
    project_role    varchar(12) NOT NULL CHECK (project_role IN ('CONTRIBUTOR', 'OBSERVER')),
    added_at        timestamptz NOT NULL,
    CONSTRAINT project_members_project_user_key UNIQUE (project_id, user_id)
);

CREATE INDEX project_members_user_idx ON project_members (organization_id, user_id);

-- One row per charter version; the lists are JSON arrays. Approved versions are never edited: a change request
-- (feature 14) supersedes them with a new version.
CREATE TABLE charters
(
    id                      uuid PRIMARY KEY,
    organization_id         uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id              uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    version_number          integer     NOT NULL,
    status                  varchar(10) NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED')),
    purpose                 varchar(4000),
    business_case           varchar(8000),
    objectives              text        NOT NULL DEFAULT '[]',
    in_scope                text        NOT NULL DEFAULT '[]',
    out_of_scope            text        NOT NULL DEFAULT '[]',
    assumptions             text        NOT NULL DEFAULT '[]',
    project_constraints     text        NOT NULL DEFAULT '[]',
    high_level_risks        text        NOT NULL DEFAULT '[]',
    milestones              text        NOT NULL DEFAULT '[]',
    summary_budget_amount   numeric(19, 4),
    summary_budget_currency varchar(3),
    sponsor_id              uuid REFERENCES users (id),
    submitted_at            timestamptz,
    submitted_by            uuid REFERENCES users (id),
    approved_by             uuid REFERENCES users (id),
    approved_at             timestamptz,
    return_comment          varchar(2000),
    created_at              timestamptz NOT NULL,
    version                 bigint      NOT NULL,
    CONSTRAINT charters_project_version_key UNIQUE (project_id, version_number),
    CONSTRAINT charters_budget_has_currency CHECK ((summary_budget_amount IS NULL) = (summary_budget_currency IS NULL))
);

-- Exactly one current (not superseded) charter per project.
CREATE UNIQUE INDEX charters_one_current_per_project ON charters (project_id) WHERE status <> 'SUPERSEDED';

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON portfolios
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON programs
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_members
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));

ALTER TABLE charters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON charters
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
