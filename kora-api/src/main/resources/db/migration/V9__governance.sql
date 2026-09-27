-- Governance module (features 11–14): risks, issues, stakeholders and change requests with their approval chain.

-- The last number handed out per project and kind (R = risk, I = issue, CR = change request), for keys like AKG-R3.
CREATE TABLE governance_sequences
(
    project_id      uuid       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    kind            varchar(2) NOT NULL CHECK (kind IN ('R', 'I', 'CR')),
    organization_id uuid       NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    last_number     integer    NOT NULL,
    PRIMARY KEY (project_id, kind)
);

CREATE TABLE risks
(
    id                   uuid PRIMARY KEY,
    organization_id      uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id           uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    number               integer      NOT NULL,
    key                  varchar(40)  NOT NULL,
    title                varchar(200) NOT NULL,
    description          varchar(4000),
    kind                 varchar(11)  NOT NULL CHECK (kind IN ('THREAT', 'OPPORTUNITY')),
    category             varchar(18)  NOT NULL,
    proximity            varchar(9),
    status               varchar(16)  NOT NULL,
    probability          smallint     NOT NULL CHECK (probability BETWEEN 1 AND 5),
    impact               smallint     NOT NULL CHECK (impact BETWEEN 1 AND 5),
    -- Stored so lists can filter and sort by it; always probability × impact.
    score                smallint GENERATED ALWAYS AS (probability * impact) STORED,
    residual_probability smallint CHECK (residual_probability BETWEEN 1 AND 5),
    residual_impact      smallint CHECK (residual_impact BETWEEN 1 AND 5),
    owner_id             uuid REFERENCES users (id),
    identified_by        uuid         NOT NULL REFERENCES users (id),
    response_strategy    varchar(8),
    response_plan        varchar(4000),
    trigger_conditions   varchar(2000),
    review_date          date,
    closure              varchar(12),
    closure_note         varchar(1000),
    issue_id             uuid,
    created_at           timestamptz  NOT NULL,
    version              bigint       NOT NULL,
    UNIQUE (project_id, number)
);

CREATE INDEX risks_project_idx ON risks (organization_id, project_id, status);

CREATE TABLE risk_assessments
(
    id                   uuid PRIMARY KEY,
    organization_id      uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    risk_id              uuid        NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
    probability          smallint    NOT NULL,
    impact               smallint    NOT NULL,
    residual_probability smallint,
    residual_impact      smallint,
    note                 varchar(1000),
    assessed_by          uuid        NOT NULL REFERENCES users (id),
    assessed_at          timestamptz NOT NULL
);

CREATE INDEX risk_assessments_risk_idx ON risk_assessments (risk_id, assessed_at);

CREATE TABLE issues
(
    id                uuid PRIMARY KEY,
    organization_id   uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id        uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    number            integer      NOT NULL,
    key               varchar(40)  NOT NULL,
    title             varchar(200) NOT NULL,
    description       varchar(4000),
    type              varchar(9)   NOT NULL,
    priority          varchar(8)   NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    priority_rank     smallint GENERATED ALWAYS AS (CASE priority
                                                        WHEN 'LOW' THEN 1
                                                        WHEN 'MEDIUM' THEN 2
                                                        WHEN 'HIGH' THEN 3
                                                        ELSE 4 END) STORED,
    status            varchar(11)  NOT NULL,
    owner_id          uuid REFERENCES users (id),
    raised_by         uuid         NOT NULL REFERENCES users (id),
    due_date          date,
    resolution        varchar(4000),
    resolved_at       timestamptz,
    risk_id           uuid REFERENCES risks (id) ON DELETE SET NULL,
    change_request_id uuid,
    created_at        timestamptz  NOT NULL,
    version           bigint       NOT NULL,
    UNIQUE (project_id, number)
);

CREATE INDEX issues_project_idx ON issues (organization_id, project_id, status);
ALTER TABLE risks ADD CONSTRAINT risks_issue_fk FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE SET NULL;

CREATE TABLE stakeholders
(
    id                        uuid PRIMARY KEY,
    organization_id           uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id                uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name                      varchar(200) NOT NULL,
    affiliation               varchar(200),
    role                      varchar(200),
    email                     varchar(254),
    phone                     varchar(40),
    user_id                   uuid REFERENCES users (id),
    power                     smallint     NOT NULL CHECK (power BETWEEN 1 AND 5),
    interest                  smallint     NOT NULL CHECK (interest BETWEEN 1 AND 5),
    influence                 smallint CHECK (influence BETWEEN 1 AND 5),
    current_engagement        varchar(10)  NOT NULL,
    desired_engagement        varchar(10)  NOT NULL,
    communication_preferences varchar(1000),
    notes                     varchar(4000),
    removed                   boolean      NOT NULL DEFAULT false,
    version                   bigint       NOT NULL
);

CREATE INDEX stakeholders_project_idx ON stakeholders (organization_id, project_id);

CREATE TABLE change_requests
(
    id                     uuid PRIMARY KEY,
    organization_id        uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id             uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    number                 integer      NOT NULL,
    revision               integer      NOT NULL,
    key                    varchar(40)  NOT NULL,
    title                  varchar(200) NOT NULL,
    description            varchar(4000),
    reason                 varchar(2000) NOT NULL,
    type                   varchar(8)   NOT NULL,
    status                 varchar(11)  NOT NULL,
    cost_delta_amount      numeric(19, 4),
    cost_delta_currency    varchar(3),
    schedule_delta_days    integer,
    scope_summary          varchar(2000),
    risk_summary           varchar(2000),
    changes_charter_scope  boolean      NOT NULL DEFAULT false,
    requested_by           uuid         NOT NULL REFERENCES users (id),
    issue_id               uuid REFERENCES issues (id) ON DELETE SET NULL,
    previous_revision_id   uuid REFERENCES change_requests (id),
    submitted_at           timestamptz,
    decided_at             timestamptz,
    created_at             timestamptz  NOT NULL,
    version                bigint       NOT NULL,
    UNIQUE (project_id, number, revision),
    CHECK ((cost_delta_amount IS NULL) = (cost_delta_currency IS NULL))
);

CREATE INDEX change_requests_project_idx ON change_requests (organization_id, project_id, status);
ALTER TABLE issues ADD CONSTRAINT issues_change_request_fk
    FOREIGN KEY (change_request_id) REFERENCES change_requests (id) ON DELETE SET NULL;

-- One row per step of a request's approval chain; decisions are never changed once made.
CREATE TABLE approval_steps
(
    id                uuid PRIMARY KEY,
    organization_id   uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    change_request_id uuid        NOT NULL REFERENCES change_requests (id) ON DELETE CASCADE,
    position          integer     NOT NULL,
    level             varchar(15) NOT NULL,
    reason            varchar(300) NOT NULL,
    approver_id       uuid REFERENCES users (id),
    approver_role     varchar(15),
    state             varchar(8)  NOT NULL,
    decided_by        uuid REFERENCES users (id),
    comment           varchar(2000),
    decided_at        timestamptz,
    UNIQUE (change_request_id, position),
    CHECK ((approver_id IS NULL) <> (approver_role IS NULL))
);

-- Stored only once an administrator changes them; until then 5% / 10 working days / 15%.
CREATE TABLE change_control_settings
(
    id                   uuid PRIMARY KEY,
    organization_id      uuid          NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE CASCADE,
    pmo_cost_percent     numeric(5, 2) NOT NULL,
    pmo_schedule_days    integer       NOT NULL,
    sponsor_cost_percent numeric(5, 2) NOT NULL,
    version              bigint        NOT NULL
);

ALTER TABLE governance_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON governance_sequences
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON risks
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON risk_assessments
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON issues
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stakeholders
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON change_requests
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_steps
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE change_control_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON change_control_settings
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
