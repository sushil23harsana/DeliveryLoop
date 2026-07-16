# DeliveryLoop

DeliveryLoop is a client UAT delivery workspace for software agencies. It replaces scattered feedback sheets with a release-based workflow for collecting contextual issues, coordinating fixes, requesting client retests, and recording final acceptance.

## Live POC

[Open the private DeliveryLoop deployment](https://deliveryloop-uat-hub.sushil23harsana.chatgpt.site)

## Included

- Staff delivery dashboard with active releases, blockers, retests, and audit activity
- Client, project, and release creation
- Release versions, builds, testing windows, instructions, and acceptance checklists
- Feedback types for bugs, change requests, content corrections, and questions
- Screenshot uploads backed by private object storage
- Status, severity, priority, assignment, and captured browser context
- Public client replies and internal delivery-team notes
- Client retesting with verify and reopen actions
- Server-enforced approval gates for blockers and incomplete acceptance checks
- Release approval records and audit history
- Search, filtering, portfolio reporting, and CSV export
- Responsive staff and client-preview interfaces
- Sign in with ChatGPT authentication and explicit email invitations
- Tenant-scoped client data with server-side role enforcement
- Agency admin, project manager, developer, client admin, tester, and viewer roles
- Member role changes, suspension/reactivation, last-seen tracking, and self-lockout protection
- Same-origin write protection, rate limits, bounded inputs, and image signature validation

## Technology

- React 19 and Next.js-compatible App Router through Vinext
- TypeScript
- Cloudflare Workers
- Cloudflare D1 for persistent records
- Cloudflare R2 for screenshot storage
- Drizzle schema and migrations
- OpenAI Sites deployment configuration

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

Install and start the development application:

```bash
npm ci
npm run dev
```

Local requests without an identity use the demo administrator. To test the owner bootstrap path, copy `.env.example` to a local ignored environment file and set `BOOTSTRAP_ADMIN_EMAIL` to the exact ChatGPT account email that should become the first agency administrator.

Create a production build:

```bash
npm run build
```

Run the project checks:

```bash
npm test
```

Generate a new database migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Project structure

```text
app/                  Product UI and API routes
db/                   Database schema, initialization, seed data, and actions
drizzle/              Generated database migrations
worker/               Cloudflare Worker entry point
public/               Public assets and social preview
.openai/hosting.json  Sites resource declarations
```

## Production access

The hosted app should remain private while the owner verifies the first agency administrator. Before opening the Sites access policy:

1. Set `BOOTSTRAP_ADMIN_EMAIL` in the hosted runtime environment.
2. Sign in once with that exact ChatGPT account.
3. Add at least one client administrator for every client workspace.
4. Verify role changes, suspension, and client isolation.
5. Change the Sites access policy to public only when external client access is intended. Anonymous visitors still cannot read workspace data; they are directed to Sign in with ChatGPT, and uninvited emails are rejected.

DeliveryLoop prepares invite emails through the user’s default email application. Fully automatic transactional email and external issue-tracker synchronization remain optional integrations rather than authentication requirements.

## License

No open-source license has been granted. All rights reserved.
