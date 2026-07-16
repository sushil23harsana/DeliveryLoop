# DeliveryLoop

DeliveryLoop is a client UAT delivery workspace for software agencies. It replaces scattered feedback sheets with a release-based workflow for collecting contextual issues, coordinating fixes, requesting client retests, and recording final acceptance.

## Live POC

[Open the private DeliveryLoop deployment](https://deliveryloop-uat-hub.sushil23harsana.chatgpt.site)

## Included in this POC

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

## POC status

This repository contains a complete functional proof of concept. The current client portal is a controlled preview mode with seeded users; production client invitations, tenant-aware authorization, real email notifications, and external issue-tracker integrations are the main next-stage requirements.

## License

No open-source license has been granted. All rights reserved.
