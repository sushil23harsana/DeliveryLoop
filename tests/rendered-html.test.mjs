import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the DeliveryLoop product surface", async () => {
  const [page, app, layout, hosting, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/DeliveryLoopApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<DeliveryLoopApp \/>/);
  assert.match(app, /Client portal/);
  assert.match(app, /Report feedback/);
  assert.match(app, /Ready for retest/);
  assert.match(app, /Approve release/);
  assert.match(app, /Export CSV/);
  assert.match(layout, /DeliveryLoop — Client UAT Workspace/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("includes deployment output, migrations, and the social card", async () => {
  await Promise.all([
    access(new URL("../dist/server/index.js", import.meta.url)),
    access(new URL("../drizzle/0000_luxuriant_karma.sql", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});
