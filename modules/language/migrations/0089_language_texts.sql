CREATE TABLE IF NOT EXISTS language_texts (
  source_hash text PRIMARY KEY,
  source text NOT NULL,
  english text,
  receipt_id bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  retry_after timestamptz
);
