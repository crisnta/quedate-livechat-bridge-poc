BEGIN;
CREATE SCHEMA IF NOT EXISTS bridge;
CREATE TABLE IF NOT EXISTS bridge.webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id text NOT NULL, webhook_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('incoming_chat','incoming_event')),
 chat_id text, thread_id text, event_id text, event_type text, author_id text,
 author_type text NOT NULL CHECK(author_type IN ('customer','agent','system','unknown')),
 text text, created_at timestamptz, received_at timestamptz NOT NULL,
 raw_payload jsonb NOT NULL, deduplication_key text NOT NULL UNIQUE,
 delivery_count integer NOT NULL DEFAULT 1, last_received_at timestamptz NOT NULL,
 normalization_status text NOT NULL CHECK(normalization_status IN ('normalized','pending_context','unsupported_shape')),
 normalization_errors jsonb NOT NULL DEFAULT '[]', normalization_version integer NOT NULL DEFAULT 1 CHECK(normalization_version=1)
);
CREATE TABLE IF NOT EXISTS bridge.chat_context (
 organization_id text NOT NULL, chat_id text NOT NULL, thread_id text NOT NULL,
 group_ids jsonb NOT NULL DEFAULT '[]', users jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL,
 PRIMARY KEY (organization_id,chat_id,thread_id)
);
CREATE INDEX IF NOT EXISTS events_received_idx ON bridge.webhook_events(received_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS events_chat_idx ON bridge.webhook_events(organization_id,chat_id,thread_id);
-- No browser/PostgREST access. Use a server-only PostgreSQL connection.
REVOKE ALL ON SCHEMA bridge FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA bridge FROM PUBLIC;
ALTER TABLE bridge.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge.chat_context ENABLE ROW LEVEL SECURITY;
COMMIT;
