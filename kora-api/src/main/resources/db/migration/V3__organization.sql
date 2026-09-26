-- Organization module (features 02, 03). Every table here is tenant-owned and protected by row-level security.

CREATE TABLE organizations
(
    id         uuid PRIMARY KEY,
    name       varchar(100) NOT NULL,
    slug       varchar(120) NOT NULL,
    currency   varchar(3)   NOT NULL,
    time_zone  varchar(64)  NOT NULL,
    created_at timestamptz  NOT NULL,
    version    bigint       NOT NULL,
    CONSTRAINT organizations_slug_key UNIQUE (slug)
);

CREATE TABLE memberships
(
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Copy of the member's profile, owned by the identity module and kept in sync by its UserProfileChanged
    -- event, so the member list can be searched and sorted without joining across module boundaries.
    member_email    varchar(254) NOT NULL,
    member_name     varchar(120) NOT NULL,
    role            varchar(20)  NOT NULL CHECK (role IN ('ORG_ADMIN', 'PMO', 'PROJECT_MANAGER', 'MEMBER', 'VIEWER')),
    joined_at       timestamptz  NOT NULL,
    version         bigint       NOT NULL,
    CONSTRAINT memberships_organization_user_key UNIQUE (organization_id, user_id)
);

CREATE INDEX memberships_user_idx ON memberships (user_id);
CREATE INDEX memberships_organization_role_idx ON memberships (organization_id, role);

CREATE TABLE invitations
(
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email           varchar(254) NOT NULL,
    role            varchar(20)  NOT NULL CHECK (role IN ('ORG_ADMIN', 'PMO', 'PROJECT_MANAGER', 'MEMBER', 'VIEWER')),
    token_hash      varchar(64)  NOT NULL,
    status          varchar(10)  NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    invited_by      uuid         NOT NULL REFERENCES users (id),
    invited_by_name varchar(120) NOT NULL,
    created_at      timestamptz  NOT NULL,
    expires_at      timestamptz  NOT NULL,
    decided_at      timestamptz,
    version         bigint       NOT NULL,
    CONSTRAINT invitations_token_hash_key UNIQUE (token_hash)
);

-- At most one pending invitation per email and organization (the application checks first; this is the backstop).
CREATE UNIQUE INDEX invitations_one_pending_per_email ON invitations (organization_id, email) WHERE status = 'PENDING';
CREATE INDEX invitations_organization_status_idx ON invitations (organization_id, status, created_at);
CREATE INDEX invitations_expiry_idx ON invitations (expires_at) WHERE status = 'PENDING';

-- Row-level security: kora_app sees and writes only rows of the organization in app.org (see V1).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
    USING (kora_tenant_visible(id))
    WITH CHECK (kora_tenant_visible(id));

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
    USING (kora_tenant_visible(organization_id))
    WITH CHECK (kora_tenant_visible(organization_id));

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations
    USING (kora_tenant_visible(organization_id))
    WITH CHECK (kora_tenant_visible(organization_id));
