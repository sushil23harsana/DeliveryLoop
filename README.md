# DeliveryLoop

DeliveryLoop is a client UAT and acceptance workspace for software agencies. It replaces feedback sheets with a controlled loop for releases, contextual issues, fixes, client retesting, and final approval.

## Live environments

- Direct Cloudflare Worker: [deliveryloop.altrd-brain.workers.dev](https://deliveryloop.altrd-brain.workers.dev)
- Previous Sites POC fallback: [deliveryloop-uat-hub.sushil23harsana.chatgpt.site](https://deliveryloop-uat-hub.sushil23harsana.chatgpt.site)

The direct Worker is the production target. Account activation email and screenshots remain unavailable until the deployment receives Resend sender settings and the Cloudflare account has R2 enabled.

## Product scope

- Agency dashboard across clients, projects, releases, blockers, retests, and audit history
- Separate tenant-scoped client portals
- Release versions, builds, testing windows, instructions, and acceptance checklists
- Bug, change-request, content, and question feedback types
- Browser, viewport, page, build, severity, priority, and assignee context
- Private screenshot storage when the `UPLOADS` R2 binding is enabled
- Public client conversations and private internal notes
- Verify/reopen retesting and blocker-aware release approval
- Search, filtering, CSV reporting, and acceptance evidence
- Agency admin, project manager, developer, client admin, tester, and viewer roles
- Member invitation, resend, role changes, suspension, and immediate session revocation

## Authentication and security

DeliveryLoop uses Better Auth with Cloudflare D1:

- Invitation-only email/password registration
- Mandatory email verification
- Minimum 12-character passwords with scrypt hashing
- Password reset with one-hour tokens and all-session revocation
- Secure, HTTP-only, same-site cookies for the browser
- Seven-day server sessions with daily refresh
- Database-backed rate limits across Worker instances
- Origin and CSRF validation
- Short-lived 15-minute JWTs for external API consumers
- Rotating asymmetric signing keys and public JWKS
- Server-side role and tenant checks on every product request
- Same-origin write checks, bounded payloads, image signature checks, and audit records

Browser code never stores a JWT. External services can obtain a token from `/api/auth/token` using an authenticated session and verify it against `/api/auth/jwks`; the token audience is `deliveryloop-api`.

## Stack

- Vinext, React 19, and TypeScript
- Cloudflare Workers and static assets
- Cloudflare D1 in the APAC region
- Cloudflare R2 for private screenshots once enabled
- Better Auth for sessions, email/password, verification, and JWT/JWKS
- Resend for invitation, verification, and password-reset email
- Drizzle schema and migrations

## Local development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Replace all placeholder values in `.dev.vars`. Local unauthenticated workspace requests use a demo administrator and local sample data; production never creates demo records.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run deploy:dry-run
```

## Production configuration

Non-secret Worker configuration is in `wrangler.jsonc`. Secrets must never be committed.

Required Cloudflare secret:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
```

Required email variables after verifying a sending domain in Resend:

```jsonc
"EMAIL_FROM": "DeliveryLoop <delivery@updates.yourdomain.com>",
"EMAIL_REPLY_TO": "support@yourdomain.com"
```

`RESEND_API_KEY` should be a sending-only, domain-restricted key. `EMAIL_REPLY_TO` is optional.

To enable screenshots after R2 is activated for the Cloudflare account:

```bash
npx wrangler r2 bucket create deliveryloop-uploads
```

Then add this binding to `wrangler.jsonc`, regenerate types, build, and deploy:

```jsonc
"r2_buckets": [
  {
    "binding": "UPLOADS",
    "bucket_name": "deliveryloop-uploads"
  }
]
```

```bash
npm run cf:types
npm run build
npm run deploy
```

## Deployment

Apply migrations before deploying application code:

```bash
npm run db:migrate:remote
npm run deploy
```

The manual GitHub deployment workflow expects a repository secret named `CLOUDFLARE_API_TOKEN`. Use a scoped Cloudflare token with Workers Scripts and D1 edit permissions. Runtime application secrets stay in Cloudflare and are not copied into GitHub Actions.

## First owner activation

1. Set `BOOTSTRAP_ADMIN_EMAIL` to the owner email in `wrangler.jsonc`.
2. Configure Resend and deploy the verified sender variables.
3. Open `/?auth=activate&email=owner@example.com`.
4. Create a 12+ character password and verify the email link.
5. Add real client workspaces and invite their administrators.
6. Enable R2 and verify a screenshot upload before a live UAT handoff.

## Project structure

```text
app/                     UI, authentication, email, and API routes
db/                      D1 schema, local fixtures, authorization, and actions
drizzle/                 Ordered production migrations
worker/                   Cloudflare Worker entry point
public/                   Static and social assets
wrangler.jsonc            Direct Cloudflare deployment configuration
worker-configuration.d.ts Generated binding and runtime types
.github/workflows/        CI and manual production deployment
```

## License

No open-source license has been granted. All rights reserved.
