CREATE TABLE IF NOT EXISTS reader_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('google','github')),
  subject text NOT NULL,
  name text NOT NULL,
  state jsonb NOT NULL DEFAULT '{"starred":[],"read":[]}',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);
