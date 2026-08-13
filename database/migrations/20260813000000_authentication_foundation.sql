CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(64) NOT NULL UNIQUE,
  display_name varchar(100) NOT NULL,
  role varchar(32) NOT NULL CHECK (role IN ('administrator', 'reviewer')),
  enabled boolean NOT NULL DEFAULT true,
  password_hash text NOT NULL,
  password_algorithm varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT users_username_normalized CHECK (username = lower(username)),
  CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$')
);

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE users IS 'Administrator-created local user accounts; no public registration.';
COMMENT ON COLUMN users.password_algorithm IS 'Hash policy identifier; initial value is argon2id-v1.';
COMMENT ON COLUMN sessions.token_hash IS 'SHA-256 hash of an opaque session identifier plus local pepper.';
