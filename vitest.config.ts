import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Domain tests run inside workerd against a real local D1, because db/workspace.ts
// imports `cloudflare:workers` and cannot be loaded by a plain node harness at all.
// Migrations are read straight from ./drizzle by filename, which deliberately
// bypasses the stale drizzle/meta/_journal.json — so this doubles as a check that
// the migration files themselves apply cleanly from empty.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "drizzle"));

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-07-16",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          r2Buckets: ["UPLOADS"],
          bindings: {
            TEST_MIGRATIONS: migrations,
            // APP_ENV=production makes ensureDatabase() short-circuit, so tests
            // exercise the migrated production schema rather than the local
            // CREATE TABLE IF NOT EXISTS + demo-seed path.
            APP_ENV: "production",
            BETTER_AUTH_SECRET: "test-secret-not-used-for-domain-tests",
            BETTER_AUTH_URL: "https://deliveryloop.test",
            BOOTSTRAP_ADMIN_EMAIL: "owner@altrdtech.com",
            // RESEND_API_KEY and SLACK_WEBHOOK_URL are deliberately unset: both
            // queue helpers return early without them, so no test makes a network
            // call or schedules a waitUntil outside a request scope.
          },
        },
      }),
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  };
});
