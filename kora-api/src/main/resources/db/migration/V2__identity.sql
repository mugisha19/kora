-- Identity module (feature 01, 23). Users are global, not tenant-owned: one person can belong to several
-- organizations with one account, so these tables have no organization_id and no row-level security.

CREATE TABLE users
(
    id            uuid PRIMARY KEY,
    -- Stored normalized (trimmed, lower-case), which makes the unique index case-insensitive.
    email         varchar(254) NOT NULL,
    password_hash varchar(255) NOT NULL,
    full_name     varchar(120) NOT NULL,
    locale        varchar(2)   NOT NULL CHECK (locale IN ('EN', 'FR', 'RW')),
    enabled       boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL,
    version       bigint       NOT NULL,
    CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE UNIQUE INDEX users_email_key ON users (email);

-- Single-use reset links. Only the SHA-256 of the token is stored.
CREATE TABLE password_reset_tokens
(
    token_hash varchar(64) PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
