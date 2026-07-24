/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// `cloudflare:test` types its env as Cloudflare.Env, which wrangler generates
// into worker-configuration.d.ts. That generated file is currently stale — it
// predates the UPLOADS R2 binding that wrangler.jsonc actually declares — so the
// bindings the tests rely on are declared here rather than by hand-editing a
// generated file. Regenerating with `npm run cf:types` would also fix UPLOADS.
declare global {
  namespace Cloudflare {
    interface Env {
      UPLOADS: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
