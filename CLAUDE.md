# DeliveryLoop project context

This file is the working context for Claude and other coding agents operating in this repository, especially when DeliveryLoop is being connected to another product in the organization.

Last verified against the repository: 2026-07-23.

## What this project is

DeliveryLoop is a multi-tenant client UAT, feedback, retest, and release-acceptance workspace for software agencies.

It replaces spreadsheets, chat threads, and disconnected issue lists with one controlled delivery loop:

1. The agency creates a client workspace and project.
2. The delivery team records scope and project phases.
3. The team prepares a release and acceptance checklist.
4. Client testers submit contextual feedback against that release.
5. The delivery team triages, discusses, fixes, and marks feedback ready for retest.
6. The client verifies or reopens the fix.
7. An authorized user approves the release only after all acceptance checks pass and all Critical/High blockers are resolved.
8. The system retains approval and audit evidence.

DeliveryLoop is a bounded delivery/UAT product. It is not currently a general project-management system, source-code issue tracker, CRM, or CI/CD orchestrator.

## Product capabilities

- Agency-wide overview of clients, projects, releases, feedback, retests, and blockers
- Tenant-scoped client portals
- Project scope version history and timeline phases
- Project-specific internal teams
- Release builds, testing windows, instructions, and acceptance checklists
- Feedback types: `Bug`, `Change request`, `Content`, and `Question`
- Captured page URL, browser, viewport, build, severity, priority, reporter, and assignee
- Up to three screenshots through the current new-feedback UI and one screenshot on a comment (the server accepts at most four attachment keys on ticket creation)
- Public client conversations and private internal notes
- Feedback search, table/board views, “my work,” CSV export, and printable acceptance reports
- Client verify/reopen flow
- Blocker-aware release approval
- Invitation-only access, email verification, password reset, role management, and session revocation
- Email invitations and activity notifications through Resend
- Optional Slack notifications through a webhook
- Daily email digests from a Cloudflare cron trigger

## Technology and deployment

- TypeScript with strict type checking
- React 19 and Next.js 16 application code
- Vinext/Vite adapter for Cloudflare Workers
- Cloudflare Worker runtime and static assets
- Cloudflare D1 (SQLite) for application and Better Auth data
- Cloudflare R2 for private screenshots
- Cloudflare Images binding for the Vinext image optimization route
- Better Auth for email/password sessions, verification, reset, JWT issuance, and JWKS
- Drizzle ORM schema plus ordered SQL migrations
- Resend for transactional email
- GitHub Actions for CI and manual production deployment

The primary production target is the direct Worker configured by `wrangler.jsonc`. The repository also contains `.openai/hosting.json` and an older Sites packaging helper. Treat the direct Worker as authoritative unless the integration task explicitly changes the hosting strategy.

The README contains useful operational history, but code and current configuration take precedence when they disagree. For example, `wrangler.jsonc` currently includes the `UPLOADS` R2 binding even though parts of the README still describe R2 as a future enablement step.

## High-level architecture

```text
Browser
  |
  | secure Better Auth cookie
  v
Vinext / Next.js routes in the Cloudflare Worker
  |
  +-- /api/auth/*            Better Auth handler
  +-- GET /api/workspace     tenant-scoped workspace snapshot
  +-- POST /api/workspace    action + payload command endpoint
  +-- POST /api/uploads      validated private image upload
  +-- GET /api/uploads/:key  authorized private image retrieval
  |
  +-- D1 binding: DB         auth, tenants, projects, UAT, audit
  +-- R2 binding: UPLOADS    screenshot objects
  +-- Images binding: IMAGES image optimization
  |
  +-- Resend API             email side effects
  +-- Slack webhook          optional activity side effects
  +-- scheduled cron         daily actionable-item digests
```

The browser is a client of server-enforced rules. Hiding a button in React is never considered authorization.

## Important files

| Path | Responsibility |
| --- | --- |
| `app/DeliveryLoopApp.tsx` | Main client UI, views, forms, local state, workspace loading, and action calls |
| `app/AuthScreen.tsx` | Sign-in, activation, verification, forgotten-password, and reset UI |
| `app/auth.ts` | Better Auth server configuration, invitation gate, JWT claims, session rules |
| `app/auth-client.ts` | Browser Better Auth client |
| `app/email.ts` | Resend email rendering/delivery, idempotency keys, Slack webhook calls |
| `app/runtime-env.ts` | Runtime binding types |
| `app/api/http.ts` | Request actor resolution, same-origin checks, request parsing, JSON/error responses |
| `app/api/workspace/route.ts` | GET workspace endpoint and POST action dispatcher |
| `app/api/uploads/**` | Private R2 upload and retrieval endpoints |
| `db/workspace.ts` | Domain rules, authorization, tenant scoping, validation, mutations, notifications, audit |
| `db/schema.ts` | Drizzle schema |
| `db/digest.ts` | Scheduled daily digest selection and delivery |
| `drizzle/*.sql` | Ordered production D1 migrations |
| `worker/index.ts` | Worker entry point, Vinext dispatch, image route, scheduled handler |
| `wrangler.jsonc` | Direct Worker bindings, variables, cron, observability, deployment identity |
| `.openai/hosting.json` | Legacy/alternate Sites binding metadata |
| `.github/workflows/ci.yml` | Lint, typecheck, build, and rendered-surface tests |
| `.github/workflows/deploy.yml` | Manual migration-first production deployment |
| `tests/rendered-html.test.mjs` | Product-surface and security regression assertions |

`worker-configuration.d.ts` is generated by Wrangler. Regenerate it with `npm run cf:types`; do not hand-edit it.

`dist`, `.next`, `.vinext`, `.wrangler`, local environment files, and TypeScript build metadata are generated or local-only and must not be committed.

## Request and authentication flow

1. `DeliveryLoopApp` calls `GET /api/workspace`.
2. `requestActor()` reads the Better Auth browser session.
3. `resolveActor()` maps the authenticated email to an active `members` row.
4. The bootstrap owner may be materialized as an `agency_admin` when the email matches `BOOTSTRAP_ADMIN_EMAIL`.
5. `getWorkspace()` applies staff-team or client-tenant scoping before returning data.
6. Mutations post `{ "action": "...", "payload": { ... } }` to `/api/workspace`.
7. The action function validates values, checks access and role, rate-limits, writes D1, records an audit event, and triggers notifications where relevant.
8. The browser reloads the scoped workspace after a successful mutation.

Localhost has a deliberate unauthenticated demo fallback. Production does not: unauthenticated production requests receive `401`.

### Authentication facts

- Registration is invitation-only.
- Email verification is required.
- Password length is 12-128 characters.
- Sessions last seven days and refresh at most daily.
- Auth rate limits are database-backed.
- Production cookies are secure, HTTP-only, and same-site.
- Resetting a password revokes all sessions.
- Suspending a member immediately deletes that user’s sessions.
- Browser code does not store a JWT.
- Better Auth exposes short-lived JWT issuance and JWKS below `/api/auth/*`.
- JWT audience is `deliveryloop-api`; JWT issuer is `BETTER_AUTH_URL`.
- JWT custom claims include `email`, `role`, and `clientId`.

Important integration limitation: the existence of `/api/auth/token` and `/api/auth/jwks` does **not** make `/api/workspace` a Bearer-token API. Product requests currently call `auth.api.getSession()` and expect a DeliveryLoop session cookie. A cross-project API must add explicit Bearer validation and purpose-built resource endpoints or adopt a shared identity/session architecture.

### Browser deep links

- `/?ticket=<TICKET_KEY>` opens feedback such as `NSC-017` after workspace load.
- `/?report=1&url=<ENCODED_URL>&vw=<VIEWPORT>` opens the feedback form with page/viewport context.
- `/?auth=activate&email=<EMAIL>` opens invitation activation.
- Better Auth verification and password-reset links also return through query-string auth modes.

These are the lowest-effort integration points for a companion application.

## Tenant and role model

There are internal staff roles and client roles:

| Role | Scope and permissions |
| --- | --- |
| `agency_admin` | All tenants and projects; client/member administration; project, release, scope, timeline, checklist, feedback, and approval operations |
| `project_manager` | Accessible/open projects; create projects/releases; manage project team, scope, phases, templates, feedback, and approvals |
| `developer` | Accessible/open projects; submit, edit, triage, assign, comment, mark duplicates, and move feedback through delivery statuses |
| `client_admin` | Own client only; manage that client’s non-staff members; submit feedback; public comments; checklist testing; verify/reopen; revise scope; approve releases |
| `client_tester` | Own client only; submit feedback; edit/withdraw own eligible feedback; public comments; checklist testing; verify/reopen |
| `client_viewer` | Own client, read-only |

Staff project scoping has a special rule:

- `agency_admin` can access every project.
- A project with no `project_members` rows is open to all internal staff.
- Once a project team exists, project managers and developers need their own member ID on that team.
- A project manager updating a non-empty team is automatically kept on that team to prevent self-lockout.

Client scoping is always based on `members.client_id`; clients cannot see another client’s projects, internal comments, staff-only templates, or project-team details.

## Domain model

```text
clients
  +-- members (client roles)
  +-- projects
        +-- project_members -> members (internal staff assignment)
        +-- project_phases
        +-- scope_versions (append-only per-project versions)
        +-- releases
              +-- checklist_items
              +-- tickets
                    +-- comments
                    +-- attachments -> R2 object key

members (internal roles have client_id = null)
audit_events (generic entity_type/entity_id trail)
reply_templates
checklist_templates

Better Auth:
user -> session
user -> account
verification
jwks
rateLimit
```

Important identifiers:

- Most database IDs are opaque strings such as `project-<uuid>`.
- `projects.code` is a unique 2-8 character uppercase alphanumeric code.
- `tickets.key` is the human-facing identifier: `<PROJECT_CODE>-<3_DIGIT_NUMBER>`.
- Use opaque IDs for internal relations and the ticket key for human-facing links.
- A companion project should store an explicit mapping between its project/release IDs and DeliveryLoop IDs. Do not infer identity from names.

Current attribution fields such as `tickets.reporter`, `tickets.assignee`, `comments.author`, `audit_events.actor`, and `releases.approved_by` store display names rather than stable member IDs. Account for that when designing reporting or cross-system identity synchronization.

## Core business rules

### Feedback

Allowed feedback types:

- `Bug`
- `Change request`
- `Content`
- `Question`

Allowed severities:

- `Critical`
- `High`
- `Medium`
- `Low`

Allowed priorities:

- `Urgent`
- `High`
- `Normal`
- `Low`

Allowed statuses:

- `Submitted`
- `Triaged`
- `In progress`
- `Needs information`
- `Approval required`
- `Ready for retest`
- `Verified`
- `Closed`
- `Deferred`
- `Rejected / out of scope`
- `Reopened`
- `Withdrawn`

Staff can currently move feedback to any allowed status; there is no strict server-side staff transition graph. Clients can only change `Ready for retest` feedback to `Verified` or `Reopened`.

Client authors can edit their own feedback only while its status is `Submitted`, `Triaged`, or `Needs information`. They can withdraw only their own feedback. Staff can edit or withdraw accessible feedback.

Private `internal` comments can only be created and read by staff. Client comments are always public.

### Screenshots

- Accepted MIME types: PNG, JPEG, WebP, GIF
- File signatures are checked; MIME type alone is not trusted.
- Maximum image size: 8 MB
- Maximum request `Content-Length`: 9 MB
- R2 objects use random UUID-based keys.
- Upload ownership is stored in R2 custom metadata and checked before attachment.
- Retrieval is routed through authorization; the bucket is not public.

Do not replace private retrieval with a public R2 URL without an explicit security decision.

### Scope and timeline

- Scope is append-only and versioned per project.
- An existing scope row is never edited or deleted.
- A revision after v1 requires a change note.
- Scope editing is allowed for agency admins, project managers, and the project’s client admin.
- Timelines have up to 20 phases with `Planned`, `In progress`, or `Done`.
- The initial phase dates become baselines; later changes preserve those baselines for slippage reporting.

### Releases and acceptance

- New releases are created with status `Preparing`.
- Existing data/UI recognize `Preparing`, `Testing`, `Retest`, and `Approved`.
- There is currently no separate workspace action that transitions a new release from `Preparing` to `Testing` or `Retest`; only approval changes release status to `Approved`. Treat this as a known workflow gap if an integration needs formal release-state synchronization.
- Approved releases cannot be edited and their checklist structure is locked.
- Checklist states are `Not tested`, `Passed`, and `Failed`.
- A tested checklist row cannot be removed.
- Approval is allowed only when:
  - every checklist row is `Passed`; and
  - no `Critical` or `High` ticket remains outside `Verified`, `Closed`, `Deferred`, or `Rejected / out of scope`.
- Agency admins, project managers, and client admins can approve within their accessible scope.
- Approval stores approver display name, timestamp, optional exceptions, and an audit event.

## Current HTTP surface

All JSON responses from product routes are `Cache-Control: no-store`.

### `GET /api/workspace`

Returns:

```json
{
  "workspace": {
    "clients": [],
    "members": [],
    "projects": [],
    "releases": [],
    "checklist": [],
    "tickets": [],
    "comments": [],
    "audit": [],
    "attachments": [],
    "templates": [],
    "scope": [],
    "projectTeam": [],
    "phases": [],
    "checklistTemplates": [],
    "directory": []
  },
  "actor": {
    "id": "...",
    "email": "...",
    "name": "...",
    "role": "...",
    "clientId": null,
    "isStaff": true
  }
}
```

The server removes inaccessible data before returning this snapshot. Do not move this filtering to the client.

### `POST /api/workspace`

Request:

```json
{
  "action": "createTicket",
  "payload": {
    "projectId": "...",
    "releaseId": "...",
    "type": "Bug",
    "title": "...",
    "actual": "...",
    "expected": "...",
    "severity": "High"
  }
}
```

Success:

```json
{ "ok": true, "result": null }
```

Failure:

```json
{ "error": "Safe user-facing message" }
```

The parser accepts string values plus string arrays only for `checklist`, `attachmentKeys`, and `memberIds`. `savePhases` sends its phase array as a JSON-encoded string.

Supported actions and primary payload fields:

| Action | Primary payload fields |
| --- | --- |
| `createClient` | `name`, `contactName`, `contactEmail`, `accent` |
| `createMember` | `clientId`, `name`, `email`, `role` |
| `resendMemberInvite` | `memberId` |
| `updateMember` | `memberId`, optional `role`, optional `active` |
| `createProject` | `clientId`, `name`, `code`, `description`, `manager`, `stage`, `stagingUrl` |
| `updateProjectTeam` | `projectId`, `memberIds[]` |
| `saveScope` | `projectId`, `body`, `changeNote` |
| `savePhases` | `projectId`, `phases` as JSON string |
| `createRelease` | `projectId`, `name`, `version`, `build`, `startDate`, `dueDate`, `testingNotes`, `checklist[]` |
| `updateRelease` | `releaseId`, `name`, `version`, `build`, `startDate`, `dueDate`, `testingNotes` |
| `createChecklistTemplate` | `title`, `checklist[]` |
| `deleteChecklistTemplate` | `templateId` |
| `addChecklistItems` | `releaseId`, `checklist[]` |
| `removeChecklistItem` | `itemId` |
| `updateChecklist` | `itemId`, `state` |
| `approveRelease` | `releaseId`, optional `exceptions` |
| `createTicket` | `projectId`, `releaseId`, `type`, `title`, `actual`, `expected`, `severity`, optional context, `attachmentKeys[]` |
| `editTicket` | `ticketId`, `type`, `severity`, `title`, `actual`, `expected`, `pageUrl` |
| `updateTicket` | `ticketId`, `field`, `value` |
| `withdrawTicket` | `ticketId` |
| `markDuplicate` | `ticketId`, `duplicateKey` |
| `addComment` | `ticketId`, `body`, `visibility`, optional `attachmentKey` |
| `createReplyTemplate` | `title`, `body` |
| `deleteReplyTemplate` | `templateId` |

This endpoint is optimized for the current first-party UI, not as a stable organizational API. Avoid making a second application depend directly on this entire command contract without first defining versioning, service authentication, idempotency, and narrower response types.

### Upload routes

- `POST /api/uploads` accepts multipart form data with a `file` field and returns `{ "key": "...", "url": "/api/uploads/<key>" }`.
- `GET /api/uploads/<key>` returns an image only when the current actor can access the associated ticket.

An upload is not visible merely because it exists in R2. It must be associated with feedback or a comment before authorized retrieval succeeds.

## Recommended integration approach

When this repository is opened beside another organizational project, first determine which system owns each concept. Do not begin by merging databases or copying components.

### Recommended default: keep DeliveryLoop as a bounded service

Use the companion product as the source of truth for its own business data and DeliveryLoop as the source of truth for UAT feedback and acceptance.

Suggested mapping:

| Companion-system concept | DeliveryLoop concept |
| --- | --- |
| Organization/customer | `client` |
| Delivery/project | `project` |
| Deployable milestone/build | `release` |
| Requirement/acceptance criterion | `checklist_item` or versioned project scope |
| UAT defect/request | `ticket` |
| User/team member | `member` |
| Final client sign-off | approved `release` plus audit evidence |

Maintain a dedicated integration mapping using stable IDs, for example:

```text
external_system
external_organization_id -> deliveryloop_client_id
external_project_id      -> deliveryloop_project_id
external_release_id      -> deliveryloop_release_id
external_issue_id        -> deliveryloop_ticket_id
```

Do not use customer names, project names, assignee names, or array position as cross-system identity.

### Integration maturity levels

#### Level 1: navigation and contextual reporting

This needs the least change:

- Link from the other product to `/?report=1&url=...&vw=...`.
- Link back to specific DeliveryLoop feedback with `/?ticket=<TICKET_KEY>`.
- Store the DeliveryLoop project/release mapping in the other product.
- Let users authenticate separately in DeliveryLoop.

This is the safest starting point when identity and data ownership are not yet settled.

#### Level 2: shared identity or SSO

The current identity system is standalone Better Auth email/password.

Before implementing SSO, decide:

- Which project is the identity provider?
- Is email a verified, stable unique key across both products?
- How do organizational roles map to the six DeliveryLoop roles?
- Who provisions and suspends client members?
- Must suspending a user in one system immediately revoke the other system’s sessions?
- Will both products share a parent domain, or remain cross-origin?

Keep DeliveryLoop authorization based on a resolved local `member` record even if authentication becomes federated. External identity should not bypass tenant membership or role checks.

#### Level 3: server-to-server API

Do not automate against the current cookie-oriented `/api/workspace` endpoint.

Add a versioned surface such as `/api/v1/projects`, `/api/v1/releases`, `/api/v1/feedback`, and `/api/v1/events` with:

- explicit Bearer JWT or service credential verification;
- issuer, audience, signature, expiry, and permission checks;
- tenant-scoped service identities;
- typed request/response schemas;
- idempotency keys for create operations;
- external ID mapping and conflict rules;
- pagination/filtering instead of a full workspace snapshot;
- stable error codes;
- audit records for integration actors;
- rate limits appropriate for machines;
- contract tests.

The existing Better Auth JWKS can be part of verification, but token issuance and product authorization must be designed together. Never accept unverified JWT claims or trust a caller-supplied `clientId`/`role`.

#### Level 4: events and workflow automation

Current outbound integrations are activity-specific email and a generic Slack message. There is no signed webhook/event API.

For reliable synchronization, add an outbox-backed event mechanism rather than sending organizational webhooks directly inside a database mutation. Candidate events include:

- `client.created`
- `project.created`
- `project.scope_revised`
- `release.created`
- `release.ready_for_testing`
- `feedback.created`
- `feedback.status_changed`
- `feedback.ready_for_retest`
- `feedback.verified`
- `feedback.reopened`
- `release.approved`
- `member.suspended`

Events should have an immutable event ID, schema version, occurred-at time, actor/service identity, tenant ID, entity ID, and retry-safe delivery semantics.

### Do not integrate by sharing D1 tables directly

Binding the same D1 database into another Worker may be technically possible, but direct writes would bypass DeliveryLoop validation, rate limits, authorization, notifications, and audit rules. Prefer a versioned service API or extract shared domain logic into a deliberately owned service.

If a shared database is explicitly chosen, first resolve:

- migration ownership;
- transaction and concurrency behavior;
- authorization enforcement;
- audit attribution;
- backward compatibility;
- deletion/retention policies;
- how both deployments coordinate schema rollout.

## Known integration and scaling gaps

These are facts to account for, not instructions to silently “fix” during unrelated work:

- Product APIs use DeliveryLoop session cookies; Bearer JWT product authorization is not implemented.
- Cross-origin browser writes are rejected by same-origin and Fetch Metadata checks.
- `GET /api/workspace` returns one large scoped snapshot with no pagination.
- The mutation API is action-based and unversioned.
- External IDs and cross-system mappings do not exist in the schema.
- There is no generic signed webhook or durable outbox.
- Several attribution and assignment fields store names, not member IDs.
- Ticket sequence generation scans existing project keys and is not protected by a transaction; concurrent machine-created feedback could race on the unique key.
- Staff feedback status changes are enum-validated but do not follow a strict transition graph.
- Release creation produces `Preparing`, but no explicit ready-for-testing/retest transition action exists.
- The UI disables checklist-state changes after approval, but `updateChecklist` does not currently repeat that approved-release lock on the server.
- The UI treats `Withdrawn` feedback as closed for its approval preview, while the server still counts a withdrawn Critical/High ticket as a blocker. The server is authoritative, but this mismatch should be resolved before automating approval.
- Runtime local setup creates tables and demo data, while production relies strictly on migrations. Integration tests must not confuse local fixtures with production behavior.
- Optional tables are loaded fail-soft during rolling deployments; that protects availability but can temporarily hide optional features before migrations land.
- The UI and server duplicate some TypeScript data shapes instead of sharing a generated contract.
- Notifications are best-effort side effects; they are not a source of truth.

If an integration depends on any of these areas, make the limitation explicit in the plan and add focused tests.

## Environment and Cloudflare bindings

| Name | Kind | Required | Purpose |
| --- | --- | --- | --- |
| `DB` | D1 binding | Yes | Product, authorization, audit, and Better Auth data |
| `ASSETS` | Fetcher binding | Yes for deployed UI | Static assets |
| `IMAGES` | Images binding | Yes for current image route | Vinext image transformations |
| `UPLOADS` | R2 binding | Required for screenshots | Private image objects |
| `APP_ENV` | Variable | Yes in production | Controls production-only behavior |
| `BETTER_AUTH_URL` | Variable | Yes in production | Canonical auth issuer/base URL |
| `BOOTSTRAP_ADMIN_EMAIL` | Variable | Required for initial owner bootstrap | Only this uninvited email may become the initial agency admin |
| `EMAIL_FROM` | Variable | Required for email | Verified Resend sender |
| `EMAIL_REPLY_TO` | Variable | Optional | Reply-to address |
| `BETTER_AUTH_SECRET` | Secret | Yes in production | Better Auth secret |
| `RESEND_API_KEY` | Secret | Required for email | Resend sending credential |
| `SLACK_WEBHOOK_URL` | Secret | Optional | Slack activity notifications |

Never commit real secrets. `.env.example` and `.dev.vars.example` contain placeholders only. Use `.dev.vars` locally and Wrangler secrets in production.

`wrangler.jsonc` currently contains production-specific account, database, URL, owner email, and bucket configuration. When integrating environments, do not copy those identifiers into another account or stage without deliberate environment configuration.

## Local development

Requirements: Node.js 22.13 or newer and npm.

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The Claude launch configuration starts `npm run dev` on port 3000.

Useful checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run deploy:dry-run
```

`npm test` builds first, then runs Node tests against the built output and important source-level security/product assertions.

## Database and migration rules

- `db/schema.ts` is the declarative schema reference.
- Production schema changes require a new ordered migration in `drizzle/`.
- Generate migrations with `npm run db:generate`, then inspect the SQL.
- Never edit or reorder a migration that may already have been applied.
- Never add production demo seed data.
- Apply migrations before deploying code that needs them.
- Runtime `CREATE TABLE IF NOT EXISTS` and demo seeding in `ensureDatabase()` are local-development behavior only.
- Keep append-only evidence append-only, especially `scope_versions` and approval audit history.
- A schema change that affects authorization or tenant scoping needs explicit negative tests for cross-tenant access.

## Deployment

Before production deployment:

```powershell
npm run lint
npm run typecheck
npm test
npm run deploy:dry-run
npm run db:migrate:remote
npm run deploy
```

Migration-first ordering is intentional. The manual GitHub workflow uses `CLOUDFLARE_API_TOKEN` only for deployment; runtime application secrets remain in Cloudflare.

Do not casually change:

- Worker name, account ID, D1 database ID, R2 bucket, or canonical auth URL;
- `BETTER_AUTH_URL` without considering JWT issuer and trusted-origin behavior;
- `BOOTSTRAP_ADMIN_EMAIL` after initial setup without confirming owner access;
- the `DB`, `UPLOADS`, `ASSETS`, or `IMAGES` binding names;
- cron time without considering its current 09:00 IST intent.

## Coding rules for this repository

When changing a server mutation:

1. Parse and bound every input.
2. Resolve the actor server-side.
3. Check tenant/project/release/ticket access.
4. Check the exact role capability.
5. Rate-limit material writes.
6. Keep dynamic SQL values bound; allowlist any dynamic column name.
7. Write the domain mutation.
8. Add an audit event when the operation changes durable business state.
9. Trigger only visibility-safe notifications.
10. Return a minimal result and add/update tests.

Additional rules:

- Keep security decisions in server code, principally `db/workspace.ts` and API helpers.
- Never trust client-side scoping, role flags, hidden controls, IDs, file MIME types, JWT claims, or external-system payloads.
- Preserve the distinction between public comments and internal notes.
- Preserve private screenshot storage and retrieval authorization.
- Revoke sessions when access is suspended.
- Keep production migrations separate from local demo bootstrapping.
- Do not expose raw internal errors to API clients; log structured details server-side.
- Do not add a broad dependency for a small utility without a clear reason.
- Follow existing React/CSS patterns unless the task intentionally introduces a design-system change.
- Preserve accessibility labels, keyboard behavior, reduced-motion support, responsive layout, print output, and dark theme.
- Do not manually edit generated files or build artifacts.

## Validation expectations

For documentation-only changes, review against the source files named in this document.

For application changes, run at minimum:

```powershell
npm run lint
npm run typecheck
npm test
```

Also run `npm run deploy:dry-run` for Worker bindings, environment, build adapter, scheduled handler, or deployment configuration changes.

For authorization/integration work, add tests for:

- unauthenticated access;
- inactive/uninvited users;
- cross-client access;
- project-team restrictions;
- role denial as well as success;
- internal-comment leakage;
- attachment ownership and retrieval;
- forged or expired service tokens;
- wrong JWT issuer/audience;
- idempotent retries;
- duplicate or out-of-order events.

The existing test suite is mostly a build/surface regression suite. Do not mistake it for comprehensive domain or security coverage.

## Instructions when connecting the companion project

The companion project is not identified in this repository. When its code/context is available, do this before implementation:

1. Read that project’s `CLAUDE.md`, authentication code, data model, API contracts, deployment configuration, and existing integration conventions.
2. Write a concept map between its organization/customer/project/release/user IDs and DeliveryLoop IDs.
3. Decide the system of record for identity, tenants, projects, releases/builds, requirements, feedback, and approval.
4. Choose the lowest integration maturity level that satisfies the goal.
5. Document trust boundaries, data flow, failure behavior, and retry ownership.
6. Identify schema/API changes required on each side.
7. Confirm whether the integration is same-origin browser navigation, cross-origin browser use, or server-to-server automation.
8. Confirm how users are provisioned, role-mapped, suspended, and audited.
9. Propose a phased plan with backward compatibility and rollback.
10. Implement only after the ownership and authentication model is unambiguous.

Questions that must be answered by comparing both projects:

- Should DeliveryLoop remain a separate deployed service or become a module?
- Are clients/organizations identical in both systems?
- Can one external project have multiple DeliveryLoop projects or releases?
- Which system creates releases and declares a build ready for UAT?
- Should feedback be mirrored to another issue tracker, or only linked?
- Which side owns status transitions and conflict resolution?
- Does one login need to work in both products?
- Are service-to-service calls required, and which side issues/verifies credentials?
- Which events must be real-time, and which may be eventually consistent?
- What data may client users see when navigating from the other product?
- What is the retention policy for screenshots, comments, and acceptance evidence?

Do not guess these answers from naming similarity. Record the decision in both projects’ architecture/integration documentation.
