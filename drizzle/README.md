# Migrations

**Migrations here are hand-written and applied by filename order.**

`wrangler d1 migrations apply` reads this directory directly and tracks what it
has run in its own `d1_migrations` table. Drizzle's `meta/_journal.json` is
**stale**: it stops at `0005_remove_demo_seed`, while `0006`–`0012` exist with no
journal entry and no `NNNN_snapshot.json`.

## Do not run `drizzle-kit generate`

That is why the script is named `db:generate:unsafe` rather than `db:generate`.

drizzle-kit would diff `db/schema.ts` against snapshot `0005` — six revisions
behind reality — and emit a migration that recreates tables which already exist
(`attachments`, `reply_templates`, `scope_versions`, `project_members`,
`project_phases`, `checklist_templates`, `release_approvals`, `project_counters`)
and re-adds columns that are already there. Applying that against production
fails mid-batch, and D1 migrations have no `down`.

If generated migrations are wanted again, the snapshot chain has to be rebuilt to
match the live schema first. Until then, write the SQL by hand.

## Adding a migration

1. Create `NNNN_short_name.sql`, using backticked identifiers and
   `--> statement-breakpoint` between statements (see `0011_checklist_templates.sql`).
2. Keep it **additive**. Never edit or reorder a migration that may already have
   been applied.
3. Mirror the change in three other places, or local development silently
   diverges from production:
   - `db/schema.ts` — the declarative reference.
   - the `tableStatements` array in `db/workspace.ts` — the local-dev
     `CREATE TABLE IF NOT EXISTS` path.
   - a PRAGMA-based column adder called from `ensureDatabase()` (see
     `ensureTicketColumns` / `ensureChecklistColumns`) for new columns on
     existing tables.
4. Run `npm run test:unit`. The vitest harness applies every file in this
   directory to an empty database, so a migration that cannot apply from scratch
   fails there first.
5. Deploy migration-first: `npm run db:migrate:remote` before `npm run deploy`.
