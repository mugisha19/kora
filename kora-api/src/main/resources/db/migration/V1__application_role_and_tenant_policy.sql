-- Tenant isolation, database layer (ADR 0007).
--
-- Flyway runs as the schema owner. The application runs every JPA transaction as kora_app (TenantAwareJpaDialect
-- issues SET LOCAL ROLE kora_app), a role that owns nothing and therefore can't bypass row-level security.
-- The role has no login and no password: it can only be assumed by the owner connection.

DO
$$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kora_app') THEN
        CREATE ROLE kora_app NOLOGIN;
    END IF;
END
$$;

GRANT kora_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO kora_app;

-- Every table created by later migrations is readable and writable by the application role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kora_app;

-- Row-level security predicate shared by every tenant-owned table. app.org is set per transaction:
--   '<uuid>'  the organization named in X-Organization-Id (after the membership check),
--   'system'  flows that legitimately cross organizations (sign-in, invitation links, scheduled jobs),
--   ''        nothing bound: tenant-owned rows are invisible (fail closed).
CREATE FUNCTION kora_tenant_visible(row_organization_id uuid) RETURNS boolean
    LANGUAGE sql
    STABLE
AS
$$
SELECT current_setting('app.org', true) = 'system'
    OR row_organization_id::text = current_setting('app.org', true)
$$;
