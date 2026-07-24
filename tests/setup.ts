import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";

// Children before parents — the schema declares real foreign keys, and D1 gives
// no reliable way to defer them, so deletion order matters.
const TABLES_CHILD_FIRST = [
  "attachments",
  "comments",
  "tickets",
  "checklist_items",
  "releases",
  "scope_versions",
  "project_members",
  "project_phases",
  // Before members: rate_limit_events.actor_id carries a foreign key to it.
  "rate_limit_events",
  "projects",
  "members",
  "clients",
  "audit_events",
  "announcements",
  "reply_templates",
  "checklist_templates",
  "session",
  "account",
  "verification",
  "jwks",
  "rateLimit",
  "user",
];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// @cloudflare/vitest-pool-workers 0.18 dropped per-test isolated storage, so
// state persists across tests unless we clear it ourselves. Truncating is enough
// — the schema itself is migrated once in beforeAll and never mutated by a test.
beforeEach(async () => {
  await env.DB.batch(TABLES_CHILD_FIRST.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
  const uploads = await env.UPLOADS.list();
  await Promise.all(uploads.objects.map((object) => env.UPLOADS.delete(object.key)));
});
