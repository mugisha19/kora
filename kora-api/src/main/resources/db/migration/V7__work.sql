-- Work module (features 08–09): tasks and the Kanban board, backlog and sprints. Every table is tenant-owned and
-- guarded by the same RLS policy as V3 (ADR 0007).

CREATE TABLE sprints
(
    id               uuid PRIMARY KEY,
    organization_id  uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id       uuid         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name             varchar(100) NOT NULL,
    goal             varchar(500),
    start_date       date         NOT NULL,
    end_date         date         NOT NULL CHECK (end_date >= start_date),
    status           varchar(7)   NOT NULL CHECK (status IN ('PLANNED', 'ACTIVE', 'CLOSED')),
    committed_points integer,
    completed_points integer,
    created_at       timestamptz  NOT NULL,
    version          bigint       NOT NULL
);

CREATE INDEX sprints_project_idx ON sprints (organization_id, project_id);
-- One sprint at a time (feature 09): the database has the last word when two managers start sprints at once.
CREATE UNIQUE INDEX sprints_one_active_per_project ON sprints (project_id) WHERE status = 'ACTIVE';

CREATE TABLE tasks
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    number          integer       NOT NULL,
    key             varchar(40)   NOT NULL,
    title           varchar(200)  NOT NULL,
    description     varchar(10000),
    type            varchar(5)    NOT NULL CHECK (type IN ('STORY', 'TASK', 'BUG', 'CHORE')),
    priority        varchar(8)    NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    -- Sorting by priority must follow severity, not the alphabet.
    priority_rank   smallint GENERATED ALWAYS AS (CASE priority
                                                      WHEN 'LOW' THEN 1
                                                      WHEN 'MEDIUM' THEN 2
                                                      WHEN 'HIGH' THEN 3
                                                      ELSE 4 END) STORED,
    status          varchar(11)   NOT NULL
        CHECK (status IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE')),
    blocked_reason  varchar(500),
    assignee_id     uuid REFERENCES users (id),
    -- A task outlives the work package it was planned under.
    wbs_node_id     uuid REFERENCES wbs_nodes (id) ON DELETE SET NULL,
    sprint_id       uuid REFERENCES sprints (id) ON DELETE SET NULL,
    story_points    integer CHECK (story_points BETWEEN 0 AND 100),
    estimate_hours  numeric(7, 2) CHECK (estimate_hours >= 0),
    remaining_hours numeric(7, 2) CHECK (remaining_hours >= 0),
    start_date      date,
    due_date        date,
    labels          varchar(400)  NOT NULL DEFAULT '[]',
    -- Lexorank: base-36 keys compared byte by byte, hence the C collation.
    rank            varchar(255) COLLATE "C" NOT NULL,
    created_at      timestamptz   NOT NULL,
    completed_at    timestamptz,
    version         bigint        NOT NULL,
    UNIQUE (project_id, number)
);

CREATE INDEX tasks_project_rank_idx ON tasks (organization_id, project_id, rank);
CREATE INDEX tasks_sprint_idx ON tasks (sprint_id);
CREATE INDEX tasks_wbs_node_idx ON tasks (wbs_node_id);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);

-- The last task number handed out per project; locked while a task is created so keys never repeat.
CREATE TABLE task_sequences
(
    project_id      uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    organization_id uuid    NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    last_number     integer NOT NULL
);

CREATE TABLE task_comments
(
    id              uuid PRIMARY KEY,
    organization_id uuid          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    task_id         uuid          NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    author_id       uuid          NOT NULL REFERENCES users (id),
    body            varchar(5000) NOT NULL,
    created_at      timestamptz   NOT NULL
);

CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

-- Only columns someone configured are stored; the others use the default name and no WIP limit.
CREATE TABLE board_columns
(
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    status          varchar(11) NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE')),
    name            varchar(40) NOT NULL,
    wip_limit       integer CHECK (wip_limit BETWEEN 1 AND 100),
    UNIQUE (project_id, status)
);

-- Remaining story points of a sprint at the end of each day, for the burndown.
CREATE TABLE sprint_day_progress
(
    id               uuid PRIMARY KEY,
    organization_id  uuid    NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    sprint_id        uuid    NOT NULL REFERENCES sprints (id) ON DELETE CASCADE,
    day              date    NOT NULL,
    remaining_points integer NOT NULL,
    UNIQUE (sprint_id, day)
);

ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sprints
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE task_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_sequences
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_comments
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON board_columns
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE sprint_day_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sprint_day_progress
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
