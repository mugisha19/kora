-- Scope module (feature 07): the work breakdown structure as an adjacency list. A project's whole tree is loaded
-- with one query and assembled in memory (ADR 0008), so no materialized path is needed for subtree queries.

CREATE TABLE wbs_nodes
(
    id                   uuid PRIMARY KEY,
    organization_id      uuid           NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id           uuid           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    parent_id            uuid REFERENCES wbs_nodes (id) ON DELETE CASCADE,
    name                 varchar(200)   NOT NULL,
    description          varchar(4000),
    type                 varchar(14)    NOT NULL CHECK (type IN ('DELIVERABLE', 'WORK_PACKAGE')),
    owner_id             uuid REFERENCES users (id),
    -- A work package's own figures; a deliverable keeps zeros and shows values rolled up from its children.
    planned_effort_hours numeric(12, 2) NOT NULL DEFAULT 0 CHECK (planned_effort_hours >= 0),
    planned_cost_amount  numeric(19, 4) NOT NULL DEFAULT 0 CHECK (planned_cost_amount >= 0),
    cost_currency        varchar(3)     NOT NULL,
    percent_complete     numeric(5, 2)  NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
    position             integer        NOT NULL CHECK (position >= 0),
    created_at           timestamptz    NOT NULL,
    version              bigint         NOT NULL
);

CREATE INDEX wbs_nodes_project_idx ON wbs_nodes (organization_id, project_id);
CREATE INDEX wbs_nodes_parent_idx ON wbs_nodes (parent_id);

ALTER TABLE wbs_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wbs_nodes
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
