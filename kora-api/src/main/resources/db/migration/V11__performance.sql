-- Performance module (feature 17): per-project EVM methods and weekly EVM snapshots; the dashboard read model gains
-- the figures features 06, 14 and 17 provide.

CREATE TABLE evm_settings
(
    project_id              uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    organization_id         uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    percent_complete_method varchar(12) NOT NULL
        CHECK (percent_complete_method IN ('PHYSICAL', 'ZERO_HUNDRED', 'FIFTY_FIFTY', 'STORY_POINTS')),
    eac_method              varchar(9)  NOT NULL CHECK (eac_method IN ('TYPICAL', 'ATYPICAL', 'COMPOSITE')),
    version                 bigint      NOT NULL
);

-- The last figures of each week, cumulative: the S-curve's history and an audit of what was reported when.
CREATE TABLE evm_snapshots
(
    id              uuid PRIMARY KEY,
    organization_id uuid           NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    project_id      uuid           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    week_start      date           NOT NULL CHECK (extract(isodow FROM week_start) = 1),
    currency        varchar(3)     NOT NULL,
    bac_amount      numeric(19, 4) NOT NULL,
    pv_amount       numeric(19, 4) NOT NULL,
    ev_amount       numeric(19, 4),
    ac_amount       numeric(19, 4) NOT NULL,
    recorded_at     timestamptz    NOT NULL,
    UNIQUE (project_id, week_start)
);

CREATE INDEX evm_snapshots_org_week_idx ON evm_snapshots (organization_id, week_start);

ALTER TABLE project_snapshots
    ADD COLUMN pv_amount               numeric(19, 4),
    ADD COLUMN evm_ev_amount           numeric(19, 4),
    ADD COLUMN actual_cost_amount      numeric(19, 4),
    ADD COLUMN spi                     numeric(8, 2),
    ADD COLUMN cpi                     numeric(8, 2),
    ADD COLUMN open_critical_risks     integer NOT NULL DEFAULT 0,
    ADD COLUMN pending_change_requests integer NOT NULL DEFAULT 0;

ALTER TABLE evm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evm_settings
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
ALTER TABLE evm_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evm_snapshots
    USING (kora_tenant_visible(organization_id)) WITH CHECK (kora_tenant_visible(organization_id));
