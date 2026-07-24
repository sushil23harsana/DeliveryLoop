import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { seedTenant } from "./helpers/fixtures";

// Proves the harness itself is sound before any behavioural test relies on it.
describe("test harness", () => {
  it("applies the real drizzle migrations, including ones missing from _journal.json", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = tables.results.map((row) => row.name);

    // From 0000, and from 0006-0011 which have no journal entry or snapshot.
    for (const table of [
      "clients",
      "projects",
      "releases",
      "checklist_items",
      "tickets",
      "comments",
      "members",
      "audit_events",
      "attachments",
      "reply_templates",
      "scope_versions",
      "project_members",
      "project_phases",
      "checklist_templates",
    ]) {
      expect(names, `${table} should exist after migrations`).toContain(table);
    }
  });

  it("runs with APP_ENV=production so no demo fixtures leak into tests", async () => {
    expect(env.APP_ENV).toBe("production");
    const clients = await env.DB.prepare("SELECT COUNT(*) AS count FROM clients").first<{
      count: number;
    }>();
    expect(clients?.count).toBe(0);
  });

  it("populates meta.changes on a conditional UPDATE", async () => {
    // The approval idempotency fix depends on this being accurate: the guarded
    // UPDATE must report 0 changed rows when its WHERE clause excludes the row.
    await env.DB.prepare(
      "INSERT INTO clients (id, name, contact_name, contact_email) VALUES (?, ?, ?, ?)",
    )
      .bind("client-meta", "Meta", "Contact", "contact@example.com")
      .run();

    const hit = await env.DB.prepare("UPDATE clients SET name = ? WHERE id = ? AND name != ?")
      .bind("Renamed", "client-meta", "Renamed")
      .run();
    expect(hit.meta.changes).toBe(1);

    const miss = await env.DB.prepare("UPDATE clients SET name = ? WHERE id = ? AND name != ?")
      .bind("Renamed", "client-meta", "Renamed")
      .run();
    expect(miss.meta.changes).toBe(0);
  });

  it("clears written rows between tests", async () => {
    // The pool dropped per-test isolated storage in 0.18, so tests/setup.ts
    // truncates every table in beforeEach. This pins that it actually works —
    // without it, tests silently contaminate each other.
    const leaked = await env.DB.prepare("SELECT id FROM clients WHERE id = ?")
      .bind("client-meta")
      .first();
    expect(leaked).toBeNull();
  });

  it("seeds a tenant through the real domain functions", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    expect(tenant.ticketKey).toBe("NSC-001");
    const checklist = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM checklist_items WHERE release_id = ?",
    )
      .bind(tenant.releaseId)
      .first<{ count: number }>();
    expect(checklist?.count).toBe(2);
  });
});
