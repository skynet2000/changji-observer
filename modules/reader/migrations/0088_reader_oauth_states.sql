CREATE TABLE IF NOT EXISTS reader_oauth_states (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google','github')),
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
