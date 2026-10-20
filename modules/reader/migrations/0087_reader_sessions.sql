CREATE TABLE IF NOT EXISTS reader_sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES reader_accounts(id) ON DELETE CASCADE,
  csrf text NOT NULL,
  expires_at timestamptz NOT NULL
);
