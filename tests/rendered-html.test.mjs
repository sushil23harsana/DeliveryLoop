import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DeliveryLoop product surface", async () => {
  const [page, app, layout, wrangler, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/DeliveryLoopApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<DeliveryLoopApp \/>/);
  assert.match(app, /Preview client portal/);
  assert.match(app, /Report feedback/);
  assert.match(app, /Ready for retest/);
  assert.match(app, /Approve release/);
  assert.match(app, /Export CSV/);
  assert.match(app, /Tenant-aware access/);
  assert.match(app, /createMember/);
  assert.match(layout, /DeliveryLoop - Client UAT Workspace/);
  assert.match(wrangler, /"binding": "DB"/);
  assert.match(wrangler, /"compatibility_date": "2026-07-16"/);
  assert.doesNotMatch(app, /ChatGPT/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("includes deployment output, migrations, and the social card", async () => {
  await Promise.all([
    access(new URL("../dist/server/index.js", import.meta.url)),
    access(new URL("../drizzle/0000_luxuriant_karma.sql", import.meta.url)),
    access(new URL("../drizzle/0001_calm_stellaris.sql", import.meta.url)),
    access(new URL("../drizzle/0002_majestic_martin_li.sql", import.meta.url)),
    access(new URL("../drizzle/0003_complex_sharon_ventura.sql", import.meta.url)),
    access(new URL("../drizzle/0004_thick_rhino.sql", import.meta.url)),
    access(new URL("../drizzle/0005_remove_demo_seed.sql", import.meta.url)),
    access(new URL("../public/og-v3.png", import.meta.url)),
  ]);
});

test("keeps authentication and authorisation server-enforced", async () => {
  const [workspace, http, uploads, auth, email, authScreen, envExample] = await Promise.all([
    readFile(new URL("../db/workspace.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/http.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/email.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/AuthScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /BOOTSTRAP_ADMIN_EMAIL/);
  assert.doesNotMatch(workspace, /realAdmins/);
  assert.match(workspace, /updateMember/);
  assert.match(workspace, /enforceRateLimit/);
  assert.match(workspace, /You cannot change your own role or access status/);
  assert.match(workspace, /DELETE FROM \"session\"/);
  assert.match(http, /Cross-origin request rejected/);
  assert.match(http, /Cache-Control/);
  assert.match(uploads, /hasValidSignature/);
  assert.match(uploads, /uploadedBy/);
  assert.match(auth, /requireEmailVerification: true/);
  assert.match(auth, /minPasswordLength: 12/);
  assert.match(auth, /storage: "database"/);
  assert.match(auth, /rotationInterval/);
  assert.match(auth, /This email does not have active DeliveryLoop access/);
  assert.doesNotMatch(authScreen, /localStorage/);
  assert.match(email, /https:\/\/api\.resend\.com\/emails/);
  assert.match(email, /Idempotency-Key/);
  assert.match(envExample, /BOOTSTRAP_ADMIN_EMAIL/);
  assert.match(envExample, /BETTER_AUTH_SECRET/);
  assert.match(envExample, /RESEND_API_KEY/);
});
