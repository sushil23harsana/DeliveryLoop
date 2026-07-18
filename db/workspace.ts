import { env } from "cloudflare:workers";
import { queueInvitationEmail, queueNotificationEmail, queueSlackMessage } from "../app/email";

type Bindings = { APP_ENV?: string; DB: D1Database; UPLOADS?: R2Bucket; BOOTSTRAP_ADMIN_EMAIL?: string };

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: string;
  clientId: string | null;
  isStaff: boolean;
};

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

function bindings(): Bindings {
  return env as unknown as Bindings;
}

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE, "emailVerified" INTEGER NOT NULL,
    "image" TEXT, "createdAt" DATE NOT NULL, "updatedAt" DATE NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT NOT NULL PRIMARY KEY, "expiresAt" DATE NOT NULL,
    "token" TEXT NOT NULL UNIQUE, "createdAt" DATE NOT NULL,
    "updatedAt" DATE NOT NULL, "ipAddress" TEXT, "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT,
    "accessTokenExpiresAt" DATE, "refreshTokenExpiresAt" DATE,
    "scope" TEXT, "password" TEXT, "createdAt" DATE NOT NULL, "updatedAt" DATE NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT NOT NULL PRIMARY KEY, "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL, "expiresAt" DATE NOT NULL,
    "createdAt" DATE NOT NULL, "updatedAt" DATE NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "jwks" (
    "id" TEXT NOT NULL PRIMARY KEY, "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL, "createdAt" DATE NOT NULL, "expiresAt" DATE
  )`,
  `CREATE TABLE IF NOT EXISTS "rateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL UNIQUE,
    "count" INTEGER NOT NULL, "lastRequest" BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL, accent TEXT NOT NULL DEFAULT '#3157D5',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL, client_id TEXT, active TEXT NOT NULL DEFAULT '1',
    invited_by TEXT NOT NULL DEFAULT 'System', invited_at TEXT,
    last_seen_at TEXT, updated_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limit_events (
    id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, client_id TEXT NOT NULL, name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '',
    manager TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'UAT',
    staging_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
    version TEXT NOT NULL, build TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Testing',
    start_date TEXT NOT NULL, due_date TEXT NOT NULL, testing_notes TEXT NOT NULL DEFAULT '',
    approved_at TEXT, approved_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY, release_id TEXT NOT NULL, title TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Not tested', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL,
    release_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
    actual TEXT NOT NULL, expected TEXT NOT NULL, severity TEXT NOT NULL,
    priority TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Submitted',
    reporter TEXT NOT NULL, assignee TEXT NOT NULL DEFAULT 'Unassigned',
    page_url TEXT NOT NULL DEFAULT '', browser TEXT NOT NULL DEFAULT '',
    viewport TEXT NOT NULL DEFAULT '', build TEXT NOT NULL DEFAULT '',
    attachment_key TEXT, duplicate_of TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, comment_id TEXT,
    key TEXT NOT NULL, uploaded_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, author TEXT NOT NULL,
    body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reply_templates (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, member_id TEXT NOT NULL,
    added_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS scope_versions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
    body TEXT NOT NULL, change_note TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL, author_role TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS project_phases (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Planned',
    baseline_start TEXT NOT NULL DEFAULT '', baseline_end TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    action TEXT NOT NULL, actor TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS members_client_idx ON members(client_id)`,
  `CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId")`,
  `CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId")`,
  `CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier")`,
  `CREATE INDEX IF NOT EXISTS rate_limit_actor_action_idx ON rate_limit_events(actor_id, action, created_at)`,
  `CREATE INDEX IF NOT EXISTS tickets_project_idx ON tickets(project_id)`,
  `CREATE INDEX IF NOT EXISTS tickets_release_idx ON tickets(release_id)`,
  `CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status)`,
  `CREATE INDEX IF NOT EXISTS comments_ticket_idx ON comments(ticket_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scope_versions_project_version_idx ON scope_versions(project_id, version)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_member_idx ON project_members(project_id, member_id)`,
  `CREATE INDEX IF NOT EXISTS attachments_ticket_idx ON attachments(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS project_phases_project_idx ON project_phases(project_id)`,
];

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const STAFF_ROLES = new Set(["agency_admin", "project_manager", "developer"]);
const CLIENT_ROLES = new Set(["client_admin", "client_tester", "client_viewer"]);
const MEMBER_ROLES = new Set([...STAFF_ROLES, ...CLIENT_ROLES]);
const TICKET_TYPES = new Set(["Bug", "Change request", "Content", "Question"]);
const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);
const PRIORITIES = new Set(["Urgent", "High", "Normal", "Low"]);
const TICKET_STATUSES = new Set(["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Verified", "Closed", "Deferred", "Rejected / out of scope", "Reopened", "Withdrawn"]);
const CHECK_STATES = new Set(["Not tested", "Passed", "Failed"]);
const PHASE_STATUSES = new Set(["Planned", "In progress", "Done"]);

function required(input: Record<string, string>, key: string, label: string, max = 500) {
  const value = (input[key] || "").trim();
  if (!value) throw new AccessError(`${label} is required`, 400);
  if (value.length > max) throw new AccessError(`${label} is too long`, 400);
  return value;
}

function optional(input: Record<string, string>, key: string, max = 2000) {
  const value = (input[key] || "").trim();
  if (value.length > max) throw new AccessError(`${key} is too long`, 400);
  return value;
}

function choice(input: Record<string, string>, key: string, label: string, values: Set<string>) {
  const value = required(input, key, label, 80);
  if (!values.has(value)) throw new AccessError(`Choose a valid ${label.toLowerCase()}`, 400);
  return value;
}

function emailAddress(input: Record<string, string>, key = "email") {
  const value = required(input, key, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new AccessError("Enter a valid email address", 400);
  return value;
}

function safeUrl(input: Record<string, string>, key: string, label: string) {
  const value = optional(input, key, 2048);
  if (!value) return "";
  if (value.startsWith("/")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    return parsed.toString();
  } catch {
    throw new AccessError(`${label} must be a valid web address`, 400);
  }
}

export function isStaffRole(role: string) {
  return STAFF_ROLES.has(role);
}

export function canSubmitFeedback(actor: Actor) {
  return actor.isStaff || actor.role === "client_admin" || actor.role === "client_tester";
}

export async function ensureDatabase() {
  const db = bindings().DB;
  if (!db) throw new Error("Database binding is unavailable");
  // Production schema and data lifecycle are migration-controlled. Runtime
  // table creation and demo fixtures are intentionally local-development only.
  if (bindings().APP_ENV === "production") return db;
  await db.batch(tableStatements.map((statement) => db.prepare(statement)));
  await ensureMemberColumns(db);
  await ensureTicketColumns(db);
  const clients = await db.prepare("SELECT COUNT(*) AS count FROM clients").first<{ count: number }>();
  if (!clients?.count) await seedDatabase(db);
  await ensureMemberSeeds(db);
  return db;
}

async function ensureMemberColumns(db: D1Database) {
  const columns = await db.prepare("PRAGMA table_info(members)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["invited_by", "ALTER TABLE members ADD COLUMN invited_by TEXT NOT NULL DEFAULT 'System'"],
    ["invited_at", "ALTER TABLE members ADD COLUMN invited_at TEXT"],
    ["last_seen_at", "ALTER TABLE members ADD COLUMN last_seen_at TEXT"],
    ["updated_at", "ALTER TABLE members ADD COLUMN updated_at TEXT"],
  ] as const;
  for (const [name, statement] of additions) {
    if (!existing.has(name)) await db.prepare(statement).run();
  }
}

async function ensureTicketColumns(db: D1Database) {
  const columns = await db.prepare("PRAGMA table_info(tickets)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column) => column.name));
  if (!existing.has("duplicate_of")) await db.prepare("ALTER TABLE tickets ADD COLUMN duplicate_of TEXT").run();
}

async function ensureMemberSeeds(db: D1Database) {
  const count = await db.prepare("SELECT COUNT(*) AS count FROM members").first<{ count: number }>();
  if (count?.count) return;
  await db.batch([
    db.prepare("INSERT INTO members (id,email,name,role,client_id) VALUES (?,?,?,?,?)").bind("member-demo-admin", "demo@deliveryloop.local", "Demo Operator", "agency_admin", null),
    db.prepare("INSERT INTO members (id,email,name,role,client_id) VALUES (?,?,?,?,?)").bind("member-pm-aarav", "aarav@agency.demo", "Aarav Patel", "project_manager", null),
    db.prepare("INSERT INTO members (id,email,name,role,client_id) VALUES (?,?,?,?,?)").bind("member-dev-isha", "isha@agency.demo", "Isha Verma", "developer", null),
    db.prepare("INSERT INTO members (id,email,name,role,client_id) VALUES (?,?,?,?,?)").bind("member-northstar", "maya@northstar.demo", "Maya Chen", "client_admin", "client-northstar"),
    db.prepare("INSERT INTO members (id,email,name,role,client_id) VALUES (?,?,?,?,?)").bind("member-atlas", "rohan@atlas.demo", "Rohan Mehta", "client_admin", "client-atlas"),
    db.prepare("INSERT INTO members (id,email,name,role,client_id) VALUES (?,?,?,?,?)").bind("member-veda", "anika@veda.demo", "Anika Rao", "client_admin", "client-veda"),
    db.prepare("INSERT INTO project_members (id,project_id,member_id,added_by) VALUES (?,?,?,?)").bind("pteam-1", "project-northstar", "member-pm-aarav", "Demo Operator"),
    db.prepare("INSERT INTO project_members (id,project_id,member_id,added_by) VALUES (?,?,?,?)").bind("pteam-2", "project-northstar", "member-dev-isha", "Demo Operator"),
  ]);
}

async function seedDatabase(db: D1Database) {
  const queries: D1PreparedStatement[] = [];
  const add = (sql: string, ...values: unknown[]) => queries.push(db.prepare(sql).bind(...values));

  add("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)", "client-northstar", "Northstar Retail", "Maya Chen", "maya@northstar.demo", "#3157D5");
  add("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)", "client-atlas", "Atlas Health", "Rohan Mehta", "rohan@atlas.demo", "#16806A");
  add("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)", "client-veda", "Veda Finance", "Anika Rao", "anika@veda.demo", "#B85E34");

  add("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)", "project-northstar", "client-northstar", "Northstar Commerce", "NSC", "Unified commerce experience for web and retail teams.", "Aarav Patel", "UAT", "https://staging.northstar.demo");
  add("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)", "project-atlas", "client-atlas", "Atlas Patient Portal", "APP", "Secure patient scheduling and care-plan portal.", "Neha Kapoor", "UAT", "https://uat.atlas.demo");
  add("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)", "project-veda", "client-veda", "Veda Operations", "VOP", "Operations dashboard for reconciliation and payouts.", "Kabir Shah", "Internal QA", "https://preview.veda.demo");

  add("INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)", "release-checkout", "project-northstar", "Checkout and promotions UAT", "v1.8", "build-482", "Testing", "2026-07-14", "2026-07-22", "Please test guest checkout, saved addresses, coupons and failed-payment recovery.");
  add("INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)", "release-booking", "project-atlas", "Appointments release", "v2.3", "build-219", "Retest", "2026-07-10", "2026-07-19", "Focus on rescheduling, provider availability and appointment reminders.");
  add("INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)", "release-payouts", "project-veda", "Payout reconciliation", "v0.9", "build-091", "Preparing", "2026-07-21", "2026-07-29", "Internal readiness review before inviting client testers.");

  const checklist = [
    ["check-1", "release-checkout", "Guest checkout with card payment", "Passed"],
    ["check-2", "release-checkout", "Coupon and promotional pricing", "Failed"],
    ["check-3", "release-checkout", "Saved address selection", "Passed"],
    ["check-4", "release-checkout", "Payment failure recovery", "Not tested"],
    ["check-5", "release-booking", "Book an available appointment", "Passed"],
    ["check-6", "release-booking", "Reschedule an appointment", "Passed"],
    ["check-7", "release-booking", "Reminder email content", "Failed"],
    ["check-8", "release-payouts", "Import settlement file", "Not tested"],
  ];
  for (const item of checklist) add("INSERT INTO checklist_items (id,release_id,title,state) VALUES (?,?,?,?)", ...item);

  const seededTickets = [
    ["ticket-1", "NSC-017", "project-northstar", "release-checkout", "Bug", "Coupon total is not refreshed after removal", "Removing a coupon leaves the discounted total visible until the page reloads.", "The total should immediately return to the original amount.", "High", "Urgent", "In progress", "Maya Chen", "Dev Malhotra", "/checkout", "Chrome 138 - macOS", "1440 x 900", "build-482"],
    ["ticket-2", "NSC-018", "project-northstar", "release-checkout", "Content", "Delivery estimate copy is unclear", "The message says 'shortly' without a date range.", "Show the estimated delivery date range used in the approved copy.", "Low", "Normal", "Submitted", "Maya Chen", "Unassigned", "/checkout/delivery", "Safari 18 - macOS", "1366 x 768", "build-482"],
    ["ticket-3", "NSC-019", "project-northstar", "release-checkout", "Change request", "Add GST number to guest checkout", "Guest checkout has no field for a company GST number.", "Allow business customers to provide a GST number.", "Medium", "Normal", "Approval required", "Vikram Sethi", "Aarav Patel", "/checkout/details", "Edge 138 - Windows", "1920 x 1080", "build-482"],
    ["ticket-4", "NSC-020", "project-northstar", "release-checkout", "Bug", "Saved address selection resets", "Selecting the second saved address resets after moving to payment.", "The selected address should remain active through payment.", "Critical", "Urgent", "Ready for retest", "Maya Chen", "Isha Verma", "/checkout/address", "Chrome 138 - Windows", "1536 x 864", "build-482"],
    ["ticket-5", "APP-031", "project-atlas", "release-booking", "Bug", "Reschedule shows old time in confirmation", "The appointment changes, but the success message displays the previous time.", "The confirmation should show the new appointment time.", "High", "High", "Ready for retest", "Rohan Mehta", "Sana Ali", "/appointments/42", "Chrome 138 - Windows", "1440 x 900", "build-219"],
    ["ticket-6", "APP-032", "project-atlas", "release-booking", "Content", "Reminder email uses internal clinic code", "The email footer displays AT-C4 instead of the clinic name.", "Display the public clinic name.", "Medium", "Normal", "In progress", "Rohan Mehta", "Sana Ali", "/notifications", "Firefox 140 - Windows", "1280 x 800", "build-219"],
    ["ticket-7", "APP-033", "project-atlas", "release-booking", "Question", "Can patients cancel within two hours?", "The cancellation button is disabled close to the appointment.", "Please confirm the agreed cancellation-window rule.", "Low", "Low", "Needs information", "Priya Nair", "Neha Kapoor", "/appointments/upcoming", "Safari 18 - iOS", "390 x 844", "build-219"],
    ["ticket-8", "VOP-006", "project-veda", "release-payouts", "Bug", "CSV preview rounds settlement totals", "Values with three decimals are shown rounded in the preview.", "Preview the exact imported value and round only final payable totals.", "Medium", "Normal", "Triaged", "QA Team", "Kabir Shah", "/settlements/import", "Chrome 138 - Windows", "1920 x 1080", "build-091"],
  ];
  for (const ticket of seededTickets) add("INSERT INTO tickets (id,key,project_id,release_id,type,title,actual,expected,severity,priority,status,reporter,assignee,page_url,browser,viewport,build) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ...ticket);

  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-1", "ticket-1", "Aarav Patel", "Confirmed and assigned. We can reproduce this when two promotions are evaluated together.", "public");
  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-2", "ticket-1", "Dev Malhotra", "Root cause is stale cart state after the remove mutation. Patch is in review.", "internal");
  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-3", "ticket-4", "Isha Verma", "The fix is available in build-483. Please retest the saved-address flow.", "public");
  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-4", "ticket-5", "Sana Ali", "Updated in build-220 and ready for confirmation.", "public");
  const scopeSeed = [
    ["scope-1", "project-northstar", 1, "Deliverables\n- Storefront with catalogue, search and product pages\n- Guest and account checkout with card payment\n- Order history for signed-in customers\n\nOut of scope\n- Loyalty points\n- Marketplace integrations", "Initial agreed scope", "Aarav Patel", "project_manager", "2026-06-02 10:15:00"],
    ["scope-2", "project-northstar", 2, "Deliverables\n- Storefront with catalogue, search and product pages\n- Guest and account checkout with card payment\n- Coupon and promotional pricing engine\n- Order history for signed-in customers\n\nOut of scope\n- Loyalty points\n- Marketplace integrations", "Added the coupon and promotions engine agreed in the June review call", "Maya Chen", "client_admin", "2026-06-18 15:40:00"],
    ["scope-3", "project-northstar", 3, "Deliverables\n- Storefront with catalogue, search and product pages\n- Guest and account checkout with card payment\n- Coupon and promotional pricing engine\n- Order history for signed-in customers\n- GST number capture for business customers\n\nOut of scope\n- Loyalty points\n- Marketplace integrations\n- Multi-currency pricing", "Added GST capture; confirmed multi-currency stays out of scope", "Aarav Patel", "project_manager", "2026-07-05 11:05:00"],
  ];
  for (const version of scopeSeed) add("INSERT INTO scope_versions (id,project_id,version,body,change_note,author,author_role,created_at) VALUES (?,?,?,?,?,?,?,?)", ...version);

  const phaseSeed = [
    ["phase-ns-1", "project-northstar", "Discovery & design", "2026-05-04", "2026-05-15", "Done", "2026-05-04", "2026-05-15", 0],
    ["phase-ns-2", "project-northstar", "Build", "2026-05-18", "2026-06-26", "Done", "2026-05-18", "2026-06-19", 1],
    ["phase-ns-3", "project-northstar", "Client UAT", "2026-06-29", "2026-07-24", "In progress", "2026-06-22", "2026-07-17", 2],
    ["phase-ns-4", "project-northstar", "Launch", "2026-07-27", "2026-07-31", "Planned", "2026-07-20", "2026-07-24", 3],
    ["phase-at-1", "project-atlas", "Build", "2026-05-11", "2026-06-19", "Done", "2026-05-11", "2026-06-19", 0],
    ["phase-at-2", "project-atlas", "Client UAT", "2026-06-22", "2026-07-19", "In progress", "2026-06-22", "2026-07-19", 1],
    ["phase-vd-1", "project-veda", "Delivery", "2026-07-01", "2026-08-14", "In progress", "2026-07-01", "2026-08-14", 0],
  ];
  for (const phase of phaseSeed) add("INSERT INTO project_phases (id,project_id,name,start_date,end_date,status,baseline_start,baseline_end,sort) VALUES (?,?,?,?,?,?,?,?,?)", ...phase);

  add("INSERT INTO audit_events (id,entity_type,entity_id,action,actor,details) VALUES (?,?,?,?,?,?)", "audit-1", "release", "release-checkout", "Release opened for UAT", "Aarav Patel", "Northstar client testers invited");
  add("INSERT INTO audit_events (id,entity_type,entity_id,action,actor,details) VALUES (?,?,?,?,?,?)", "audit-2", "ticket", "ticket-4", "Ready for retest", "Isha Verma", "Fix deployed in build-483");
  await db.batch(queries);
}

export async function resolveActor(identity: { email: string; name: string } | null, allowDemo = false): Promise<Actor> {
  const db = await ensureDatabase();
  if (!identity) {
    if (!allowDemo) throw new AccessError("Sign in to continue", 401);
    return { id: "member-demo-admin", email: "demo@deliveryloop.local", name: "Demo Operator", role: "agency_admin", clientId: null, isStaff: true };
  }

  const normalizedEmail = identity.email.trim().toLowerCase();
  let row = await db.prepare("SELECT id,email,name,role,client_id,active,invited_by,invited_at,last_seen_at,updated_at FROM members WHERE lower(email) = ?")
    .bind(normalizedEmail).first<Record<string, string | null>>();

  if (!row) {
    const bootstrapEmail = (bindings().BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    if (bootstrapEmail && normalizedEmail === bootstrapEmail) {
      const memberId = id("member");
      await db.prepare("INSERT INTO members (id,email,name,role,client_id,invited_by,invited_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
        .bind(memberId, normalizedEmail, identity.name, "agency_admin", null, "Owner bootstrap").run();
      row = { id: memberId, email: normalizedEmail, name: identity.name, role: "agency_admin", client_id: null, active: "1", invited_by: "Owner bootstrap", invited_at: null, last_seen_at: null, updated_at: null };
    } else {
      throw new AccessError("This account has not been invited to DeliveryLoop", 403);
    }
  }

  if (row.active !== "1") throw new AccessError("This account is inactive", 403);
  await db.prepare("UPDATE members SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-1 hour'))")
    .bind(String(row.id)).run();
  const role = String(row.role);
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role,
    clientId: row.client_id ? String(row.client_id) : null,
    isStaff: isStaffRole(role),
  };
}

export async function getWorkspace(actor: Actor) {
  const db = await ensureDatabase();
  const [clients, projects, releases, checklist, tickets, comments, audit, members, attachments, templates, scope, team, phases] = await Promise.all([
    db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM releases ORDER BY due_date ASC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM checklist_items ORDER BY created_at ASC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM tickets ORDER BY updated_at DESC, created_at DESC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM comments ORDER BY created_at ASC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 200").all<Record<string, unknown>>(),
    db.prepare("SELECT id,email,name,role,client_id,active,invited_by,invited_at,last_seen_at,updated_at,created_at FROM members ORDER BY created_at DESC").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM attachments ORDER BY created_at ASC").all<Record<string, unknown>>(),
    actor.isStaff
      // Fail-soft so a deploy that lands before migration 0007 cannot take the
      // whole workspace down over an optional feature table.
      ? db.prepare("SELECT * FROM reply_templates ORDER BY created_at ASC").all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] }))
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    // Fail-soft so a deploy that lands before migration 0008 cannot take the
    // whole workspace down over the optional scope-of-work table.
    db.prepare("SELECT * FROM scope_versions ORDER BY project_id ASC, version ASC").all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
    db.prepare("SELECT * FROM project_members ORDER BY created_at ASC").all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
    db.prepare("SELECT * FROM project_phases ORDER BY project_id ASC, sort ASC, start_date ASC").all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
  ]);

  if (actor.isStaff) {
    const teamRows = team.results as { project_id: string; member_id: string }[];
    if (actor.role === "agency_admin") {
      return { clients: clients.results, projects: projects.results, releases: releases.results, checklist: checklist.results, tickets: tickets.results, comments: comments.results, audit: audit.results, members: members.results, attachments: attachments.results, templates: templates.results, scope: scope.results, projectTeam: team.results, phases: phases.results, directory: [] as Record<string, unknown>[] };
    }
    // Project managers and developers get full detail only for projects whose
    // team they are on. Projects with no team assigned stay open to everyone.
    const myProjectIds = new Set(teamRows.filter((row) => row.member_id === actor.id).map((row) => row.project_id));
    const teamedProjectIds = new Set(teamRows.map((row) => row.project_id));
    const accessible = projects.results.filter((project) => !teamedProjectIds.has(project.id as string) || myProjectIds.has(project.id as string));
    const accessibleIds = new Set(accessible.map((project) => project.id));
    const memberNameById = new Map(members.results.map((member) => [member.id, member.name]));
    const directory = projects.results.filter((project) => !accessibleIds.has(project.id)).map((project) => ({
      id: project.id, client_id: project.client_id, name: project.name, code: project.code, stage: project.stage, manager: project.manager,
      team: teamRows.filter((row) => row.project_id === project.id).map((row) => memberNameById.get(row.member_id)).filter(Boolean),
    }));
    const staffReleases = releases.results.filter((release) => accessibleIds.has(release.project_id));
    const staffReleaseIds = new Set(staffReleases.map((release) => release.id));
    const staffTickets = tickets.results.filter((ticket) => accessibleIds.has(ticket.project_id));
    const staffTicketIds = new Set(staffTickets.map((ticket) => ticket.id));
    return {
      clients: clients.results,
      projects: accessible,
      releases: staffReleases,
      checklist: checklist.results.filter((item) => staffReleaseIds.has(item.release_id)),
      tickets: staffTickets,
      comments: comments.results.filter((comment) => staffTicketIds.has(comment.ticket_id)),
      audit: audit.results.filter((event) =>
        (event.entity_type === "ticket" && staffTicketIds.has(event.entity_id)) ||
        (event.entity_type === "release" && staffReleaseIds.has(event.entity_id)) ||
        ((event.entity_type === "scope" || event.entity_type === "project") && accessibleIds.has(event.entity_id)) ||
        !["ticket", "release", "scope", "project"].includes(event.entity_type as string)),
      members: members.results,
      attachments: attachments.results.filter((attachment) => staffTicketIds.has(attachment.ticket_id)),
      templates: templates.results,
      scope: scope.results.filter((version) => accessibleIds.has(version.project_id)),
      projectTeam: team.results.filter((row) => accessibleIds.has(row.project_id)),
      phases: phases.results.filter((phase) => accessibleIds.has(phase.project_id)),
      directory,
    };
  }

  if (!actor.clientId) throw new AccessError("Client membership is incomplete", 403);
  const scopedClients = clients.results.filter((client) => client.id === actor.clientId);
  const scopedProjects = projects.results.filter((project) => project.client_id === actor.clientId);
  const projectIds = new Set(scopedProjects.map((project) => project.id));
  const scopedReleases = releases.results.filter((release) => projectIds.has(release.project_id));
  const releaseIds = new Set(scopedReleases.map((release) => release.id));
  const scopedTickets = tickets.results.filter((ticket) => projectIds.has(ticket.project_id));
  const ticketIds = new Set(scopedTickets.map((ticket) => ticket.id));
  const scopedAudit = audit.results.filter((event) =>
    (event.entity_type === "ticket" && ticketIds.has(event.entity_id)) ||
    (event.entity_type === "release" && releaseIds.has(event.entity_id)) ||
    (event.entity_type === "scope" && projectIds.has(event.entity_id))
  );
  return {
    clients: scopedClients,
    projects: scopedProjects,
    releases: scopedReleases,
    checklist: checklist.results.filter((item) => releaseIds.has(item.release_id)),
    tickets: scopedTickets,
    comments: comments.results.filter((comment) => ticketIds.has(comment.ticket_id) && comment.visibility === "public"),
    audit: scopedAudit,
    members: actor.role === "client_admin" ? members.results.filter((member) => member.client_id === actor.clientId) : [],
    attachments: attachments.results.filter((attachment) => ticketIds.has(attachment.ticket_id)),
    templates: [],
    scope: scope.results.filter((version) => projectIds.has(version.project_id)),
    projectTeam: [] as Record<string, unknown>[],
    phases: phases.results.filter((phase) => projectIds.has(phase.project_id)),
    directory: [] as Record<string, unknown>[],
  };
}

async function audit(db: D1Database, entityType: string, entityId: string, action: string, actor: Actor, details = "") {
  await db.prepare("INSERT INTO audit_events (id,entity_type,entity_id,action,actor,details) VALUES (?,?,?,?,?,?)")
    .bind(id("audit"), entityType, entityId, action, actor.name, details).run();
}

async function staffEmails(db: D1Database, exclude: string) {
  const rows = await db.prepare("SELECT email FROM members WHERE client_id IS NULL AND active = '1' AND role IN ('agency_admin','project_manager')")
    .all<{ email: string }>();
  return rows.results.map((row) => row.email).filter((email) => email.toLowerCase() !== exclude.toLowerCase());
}

async function clientSideEmails(db: D1Database, clientId: string, reporter: string, exclude: string) {
  const rows = await db.prepare("SELECT email,name,role FROM members WHERE client_id = ? AND active = '1' AND role IN ('client_admin','client_tester')")
    .all<{ email: string; name: string; role: string }>();
  return rows.results
    .filter((row) => row.role === "client_admin" || row.name === reporter)
    .map((row) => row.email)
    .filter((email) => email.toLowerCase() !== exclude.toLowerCase());
}

type TicketNotifyKind = "created" | "retest" | "reopened" | "verified" | "comment" | "withdrawn";

async function queueTicketNotification(db: D1Database, actor: Actor, ticketId: string, kind: TicketNotifyKind) {
  try {
    const ticket = await db.prepare(`SELECT t.key, t.title, t.reporter, p.client_id, p.name AS project_name
      FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`)
      .bind(ticketId).first<{ key: string; title: string; reporter: string; client_id: string; project_name: string }>();
    if (!ticket) return;
    const toClientSide = kind === "retest" || (actor.isStaff && (kind === "created" || kind === "comment" || kind === "withdrawn"));
    const recipients = toClientSide
      ? await clientSideEmails(db, ticket.client_id, ticket.reporter, actor.email)
      : await staffEmails(db, actor.email);
    const label = `“${ticket.title}” (${ticket.key})`;
    const content: Record<TicketNotifyKind, { subject: string; heading: string; copy: string }> = {
      created: { subject: `New feedback ${ticket.key}: ${ticket.title}`, heading: "New feedback reported", copy: `${actor.name} reported ${label} on ${ticket.project_name}.` },
      retest: { subject: `${ticket.key} is ready to retest`, heading: "A fix is ready to retest", copy: `${label} on ${ticket.project_name} has a fix waiting for your confirmation.` },
      reopened: { subject: `${ticket.key} was reopened`, heading: "Feedback reopened after retest", copy: `${actor.name} retested ${label} on ${ticket.project_name} and the problem is still present.` },
      verified: { subject: `${ticket.key} verified by the client`, heading: "Fix verified", copy: `${actor.name} confirmed the fix for ${label} on ${ticket.project_name}.` },
      comment: { subject: `New reply on ${ticket.key}`, heading: "New reply on feedback", copy: `${actor.name} replied on ${label} on ${ticket.project_name}.` },
      withdrawn: { subject: `${ticket.key} was withdrawn`, heading: "Feedback withdrawn", copy: `${actor.name} withdrew ${label} on ${ticket.project_name}.` },
    };
    await queueNotificationEmail({
      recipients,
      ...content[kind],
      eyebrow: "DeliveryLoop update",
      button: "Open feedback",
      path: `/?ticket=${encodeURIComponent(ticket.key)}`,
      eventId: `${kind}:${ticketId}:${crypto.randomUUID()}`,
    });
    queueSlackMessage(`${content[kind].heading}: ${content[kind].copy}`);
  } catch (error) {
    console.error(JSON.stringify({ event: "ticket_notification_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}

// Anyone written as "@Full Name" in a comment gets a direct email, provided the
// comment is visible to them: staff can always be mentioned, client members only
// on public comments for their own client's ticket.
async function queueMentionNotifications(db: D1Database, actor: Actor, ticketId: string, body: string, visibility: string) {
  try {
    if (!body.includes("@")) return;
    const ticket = await db.prepare(`SELECT t.key, t.title, p.client_id, p.name AS project_name
      FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`)
      .bind(ticketId).first<{ key: string; title: string; client_id: string; project_name: string }>();
    if (!ticket) return;
    const rows = await db.prepare("SELECT email,name,role,client_id FROM members WHERE active = '1'")
      .all<{ email: string; name: string; role: string; client_id: string | null }>();
    const lowerBody = body.toLowerCase();
    const mentioned = rows.results.filter((member) =>
      member.name.trim().length > 1 &&
      lowerBody.includes(`@${member.name.trim().toLowerCase()}`) &&
      member.email.toLowerCase() !== actor.email.toLowerCase() &&
      (isStaffRole(member.role) || (visibility === "public" && member.client_id === ticket.client_id))
    );
    if (!mentioned.length) return;
    await queueNotificationEmail({
      recipients: mentioned.map((member) => member.email),
      subject: `${actor.name} mentioned you on ${ticket.key}`,
      eyebrow: "DeliveryLoop mention",
      heading: "You were mentioned",
      copy: `${actor.name} mentioned you on “${ticket.title}” (${ticket.key}) on ${ticket.project_name}: ${body.slice(0, 240)}`,
      button: "Open feedback",
      path: `/?ticket=${encodeURIComponent(ticket.key)}`,
      eventId: `mention:${ticketId}:${crypto.randomUUID()}`,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "mention_notification_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}

export async function enforceRateLimit(actor: Actor, action: string, limit: number, windowMinutes: number) {
  const db = await ensureDatabase();
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE actor_id = ? AND action = ? AND created_at >= datetime('now', ?)")
    .bind(actor.id, action, `-${windowMinutes} minutes`).first<{ count: number }>();
  if ((recent?.count || 0) >= limit) throw new AccessError("Too many requests. Please wait and try again.", 429);
  await db.batch([
    db.prepare("INSERT INTO rate_limit_events (id,actor_id,action) VALUES (?,?,?)").bind(id("rate"), actor.id, action),
    db.prepare("DELETE FROM rate_limit_events WHERE created_at < datetime('now', '-2 days')"),
  ]);
}

async function projectClientId(db: D1Database, projectId: string) {
  const project = await db.prepare("SELECT client_id FROM projects WHERE id = ?").bind(projectId).first<{ client_id: string }>();
  if (!project) throw new AccessError("Project not found", 404);
  return project.client_id;
}

async function assertProjectAccess(db: D1Database, actor: Actor, projectId: string) {
  if (actor.isStaff) {
    if (actor.role === "agency_admin") return;
    // Projects with no assigned team stay open to every teammate; once a team
    // exists, only its members (and admins) can work on the project.
    const rows = await db.prepare("SELECT member_id FROM project_members WHERE project_id = ?")
      .bind(projectId).all<{ member_id: string }>().catch(() => null);
    if (!rows || !rows.results.length) return;
    if (!rows.results.some((row) => row.member_id === actor.id)) throw new AccessError("You are not on this project's team");
    return;
  }
  if ((await projectClientId(db, projectId)) !== actor.clientId) throw new AccessError("You do not have access to this project");
}

async function assertReleaseAccess(db: D1Database, actor: Actor, releaseId: string) {
  const release = await db.prepare("SELECT project_id FROM releases WHERE id = ?").bind(releaseId).first<{ project_id: string }>();
  if (!release) throw new AccessError("Release not found", 404);
  await assertProjectAccess(db, actor, release.project_id);
}

async function assertTicketAccess(db: D1Database, actor: Actor, ticketId: string) {
  const ticket = await db.prepare("SELECT project_id FROM tickets WHERE id = ?").bind(ticketId).first<{ project_id: string }>();
  if (!ticket) throw new AccessError("Feedback not found", 404);
  await assertProjectAccess(db, actor, ticket.project_id);
}

function requireRole(actor: Actor, roles: string[], message: string) {
  if (!roles.includes(actor.role)) throw new AccessError(message);
}

export async function createClient(input: Record<string, string>, actor: Actor) {
  requireRole(actor, ["agency_admin"], "Only an agency administrator can create client workspaces");
  const db = await ensureDatabase();
  const name = required(input, "name", "Client name", 120);
  const contactName = required(input, "contactName", "Contact name", 120);
  const contactEmail = emailAddress(input, "contactEmail");
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent || "") ? input.accent : "#3157D5";
  await enforceRateLimit(actor, "client:create", 20, 60);
  const clientId = id("client");
  await db.prepare("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)")
    .bind(clientId, name, contactName, contactEmail, accent).run();
  await audit(db, "client", clientId, "Client added", actor, name);
  return clientId;
}

export async function createMember(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const clientId = optional(input, "clientId", 100) || null;
  if (actor.isStaff) {
    requireRole(actor, ["agency_admin"], "Only an agency administrator can manage access");
  } else if (!(actor.role === "client_admin" && actor.clientId === clientId)) {
    throw new AccessError("You cannot manage members for this client");
  }
  const role = choice(input, "role", "Role", MEMBER_ROLES);
  if (!actor.isStaff && isStaffRole(role)) throw new AccessError("Client administrators cannot create staff accounts");
  if (isStaffRole(role) && clientId) throw new AccessError("Internal team members cannot belong to a client workspace", 400);
  if (!isStaffRole(role) && !clientId) throw new AccessError("Choose a client workspace", 400);
  if (clientId) {
    const client = await db.prepare("SELECT id FROM clients WHERE id = ?").bind(clientId).first<{ id: string }>();
    if (!client) throw new AccessError("Client workspace not found", 404);
  }
  const email = emailAddress(input);
  const name = required(input, "name", "Name", 120);
  const existing = await db.prepare("SELECT id FROM members WHERE lower(email) = ?").bind(email).first<{ id: string }>();
  if (existing) throw new AccessError("This email already has DeliveryLoop access", 409);
  await enforceRateLimit(actor, "member:create", 50, 60);
  const memberId = id("member");
  await db.prepare("INSERT INTO members (id,email,name,role,client_id,invited_by,invited_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .bind(memberId, email, name, role, clientId, actor.name).run();
  await audit(db, "member", memberId, "Member invited", actor, email);
  const emailQueued = await queueInvitationEmail({ id: memberId, email, name }, actor.name);
  return { memberId, emailQueued };
}

export async function resendMemberInvite(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const memberId = required(input, "memberId", "Member", 100);
  const member = await db.prepare("SELECT id,email,name,role,client_id,active FROM members WHERE id = ?")
    .bind(memberId).first<{ id: string; email: string; name: string; role: string; client_id: string | null; active: string }>();
  if (!member) throw new AccessError("Member not found", 404);
  if (actor.isStaff) {
    requireRole(actor, ["agency_admin"], "Only an agency administrator can manage access");
  } else if (!(actor.role === "client_admin" && actor.clientId === member.client_id && !isStaffRole(member.role))) {
    throw new AccessError("You cannot manage this member");
  }
  if (member.active !== "1") throw new AccessError("Restore this member's access before resending the invitation", 400);
  await enforceRateLimit(actor, "member:resend-invite", 20, 60);
  const emailQueued = await queueInvitationEmail(member, actor.name, crypto.randomUUID());
  if (!emailQueued) throw new AccessError("Email delivery is not configured yet", 503);
  await db.prepare("UPDATE members SET invited_by = ?, invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(actor.name, member.id).run();
  await audit(db, "member", member.id, "Invitation resent", actor, member.email);
  return { memberId: member.id, emailQueued };
}

export async function updateMember(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const memberId = required(input, "memberId", "Member", 100);
  const member = await db.prepare("SELECT id,email,role,client_id,active FROM members WHERE id = ?")
    .bind(memberId).first<{ id: string; email: string; role: string; client_id: string | null; active: string }>();
  if (!member) throw new AccessError("Member not found", 404);
  if (actor.isStaff) {
    requireRole(actor, ["agency_admin"], "Only an agency administrator can manage access");
  } else if (!(actor.role === "client_admin" && actor.clientId === member.client_id && !isStaffRole(member.role))) {
    throw new AccessError("You cannot manage this member");
  }

  const nextRole = input.role ? choice(input, "role", "Role", MEMBER_ROLES) : member.role;
  const nextActive = input.active ? choice(input, "active", "Status", new Set(["0", "1"])) : member.active;
  if (!actor.isStaff && isStaffRole(nextRole)) throw new AccessError("Client administrators cannot assign staff roles");
  if (actor.id === member.id && (nextRole !== member.role || nextActive !== member.active)) {
    throw new AccessError("You cannot change your own role or access status");
  }
  if (member.role === "agency_admin" && (nextRole !== "agency_admin" || nextActive !== "1")) {
    const admins = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE role = 'agency_admin' AND active = '1'").first<{ count: number }>();
    if ((admins?.count || 0) <= 1) throw new AccessError("At least one active agency administrator is required");
  }
  if (member.role === "client_admin" && member.client_id && (nextRole !== "client_admin" || nextActive !== "1")) {
    const admins = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE client_id = ? AND role = 'client_admin' AND active = '1'")
      .bind(member.client_id).first<{ count: number }>();
    if ((admins?.count || 0) <= 1) throw new AccessError("Add another active client administrator before changing this account");
  }
  if (member.client_id && isStaffRole(nextRole)) throw new AccessError("Move staff accounts through the internal team, not a client workspace", 400);
  if (!member.client_id && !isStaffRole(nextRole)) throw new AccessError("Internal accounts require an internal role", 400);

  await enforceRateLimit(actor, "member:update", 120, 60);
  await db.prepare("UPDATE members SET role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(nextRole, nextActive, memberId).run();
  if (nextActive === "0" && member.active !== "0") {
    await db.prepare('DELETE FROM "session" WHERE "userId" IN (SELECT "id" FROM "user" WHERE lower("email") = ?)')
      .bind(member.email.toLowerCase()).run();
  }
  await audit(db, "member", memberId, nextActive === "1" ? "Member access updated" : "Member access suspended", actor, `${member.email} - ${nextRole}`);
}

export async function createProject(input: Record<string, string>, actor: Actor) {
  requireRole(actor, ["agency_admin", "project_manager"], "Only administrators and project managers can create projects");
  const db = await ensureDatabase();
  const clientId = required(input, "clientId", "Client", 100);
  const client = await db.prepare("SELECT id FROM clients WHERE id = ?").bind(clientId).first<{ id: string }>();
  if (!client) throw new AccessError("Client workspace not found", 404);
  const name = required(input, "name", "Project name", 140);
  const code = required(input, "code", "Project code", 8).toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(code)) throw new AccessError("Project code must be 2-8 letters or numbers", 400);
  const existingCode = await db.prepare("SELECT id FROM projects WHERE code = ?").bind(code).first<{ id: string }>();
  if (existingCode) throw new AccessError("This project code is already in use", 409);
  const manager = required(input, "manager", "Project lead", 120);
  const description = optional(input, "description", 1000);
  const stage = ["UAT", "Internal QA", "Live"].includes(input.stage) ? input.stage : "UAT";
  const stagingUrl = safeUrl(input, "stagingUrl", "Staging URL");
  await enforceRateLimit(actor, "project:create", 50, 60);
  const projectId = id("project");
  await db.prepare("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)")
    .bind(projectId, clientId, name, code, description, manager, stage, stagingUrl).run();
  await audit(db, "project", projectId, "Project created", actor, name);
  return projectId;
}

export async function createRelease(input: Record<string, string> & { checklist?: string[] }, actor: Actor) {
  requireRole(actor, ["agency_admin", "project_manager"], "Only administrators and project managers can create releases");
  const db = await ensureDatabase();
  const projectId = required(input, "projectId", "Project", 100);
  const project = await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first<{ id: string }>();
  if (!project) throw new AccessError("Project not found", 404);
  await assertProjectAccess(db, actor, projectId);
  const name = required(input, "name", "Release name", 160);
  const version = required(input, "version", "Version", 40);
  const build = required(input, "build", "Build", 80);
  const startDate = required(input, "startDate", "Start date", 10);
  const dueDate = required(input, "dueDate", "Due date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < startDate) {
    throw new AccessError("Choose a valid testing window", 400);
  }
  const testingNotes = optional(input, "testingNotes", 3000);
  const checklist = (input.checklist || []).map((item) => item.trim()).filter(Boolean);
  if (checklist.length > 50 || checklist.some((item) => item.length > 180)) throw new AccessError("Use up to 50 checklist items of 180 characters each", 400);
  await enforceRateLimit(actor, "release:create", 50, 60);
  const releaseId = id("release");
  await db.prepare("INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(releaseId, projectId, name, version, build, "Preparing", startDate, dueDate, testingNotes).run();
  for (const title of checklist) {
    await db.prepare("INSERT INTO checklist_items (id,release_id,title,state) VALUES (?,?,?,?)").bind(id("check"), releaseId, title, "Not tested").run();
  }
  await audit(db, "release", releaseId, "Release created", actor, name);
  return releaseId;
}

async function validateAttachmentKey(key: string, actor: Actor) {
  if (!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/i.test(key)) throw new AccessError("Invalid screenshot reference", 400);
  const upload = await getUploads().head(key);
  if (!upload) throw new AccessError("Screenshot was not found", 400);
  const uploadedBy = upload.customMetadata?.uploadedBy;
  if (uploadedBy && uploadedBy !== actor.id) throw new AccessError("Screenshot belongs to another member");
}

export async function createTicket(input: Record<string, string> & { attachmentKeys?: string[] }, actor: Actor) {
  const db = await ensureDatabase();
  if (!canSubmitFeedback(actor)) throw new AccessError("Your role has read-only access");
  const projectId = required(input, "projectId", "Project", 100);
  const releaseId = required(input, "releaseId", "Release", 100);
  await assertProjectAccess(db, actor, projectId);
  await assertReleaseAccess(db, actor, releaseId);
  const release = await db.prepare("SELECT project_id FROM releases WHERE id = ?").bind(releaseId).first<{ project_id: string }>();
  if (release?.project_id !== projectId) throw new AccessError("The selected release does not belong to this project", 400);
  const type = choice(input, "type", "Feedback type", TICKET_TYPES);
  const severity = choice(input, "severity", "Severity", SEVERITIES);
  const title = required(input, "title", "Title", 180);
  const actual = required(input, "actual", "Observed result", 5000);
  const expected = required(input, "expected", "Expected result", 5000);
  const pageUrl = safeUrl(input, "pageUrl", "Page URL");
  const browser = optional(input, "browser", 500);
  const viewport = optional(input, "viewport", 80);
  const build = optional(input, "build", 80);
  const legacyKey = optional(input, "attachmentKey", 100);
  const attachmentKeys = [...new Set([...(legacyKey ? [legacyKey] : []), ...(input.attachmentKeys || [])])].slice(0, 4);
  for (const key of attachmentKeys) await validateAttachmentKey(key, actor);
  await enforceRateLimit(actor, "feedback:create", 20, 60);
  const project = await db.prepare("SELECT code FROM projects WHERE id = ?").bind(projectId).first<{ code: string }>();
  const existing = await db.prepare("SELECT key FROM tickets WHERE project_id = ?").bind(projectId).all<{ key: string }>();
  const nextNumber = existing.results.reduce((largest, row) => {
    const suffix = Number(row.key.split("-").pop());
    return Number.isFinite(suffix) ? Math.max(largest, suffix) : largest;
  }, 0) + 1;
  const key = `${project?.code || "UAT"}-${String(nextNumber).padStart(3, "0")}`;
  const ticketId = id("ticket");
  await db.prepare(`INSERT INTO tickets
    (id,key,project_id,release_id,type,title,actual,expected,severity,priority,status,reporter,assignee,page_url,browser,viewport,build,attachment_key)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(ticketId, key, projectId, releaseId, type, title, actual, expected, severity, "Normal", "Submitted", actor.name, "Unassigned", pageUrl, browser, viewport, build, null).run();
  for (const attachmentKey of attachmentKeys) {
    await db.prepare("INSERT INTO attachments (id,ticket_id,comment_id,key,uploaded_by) VALUES (?,?,?,?,?)")
      .bind(id("attach"), ticketId, null, attachmentKey, actor.name).run();
  }
  await audit(db, "ticket", ticketId, "Feedback submitted", actor, key);
  await queueTicketNotification(db, actor, ticketId, "created");
  return { ticketId, key };
}

export async function editTicket(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const ticketId = required(input, "ticketId", "Feedback", 100);
  await assertTicketAccess(db, actor, ticketId);
  const ticket = await db.prepare("SELECT status, reporter FROM tickets WHERE id = ?").bind(ticketId).first<{ status: string; reporter: string }>();
  if (!ticket) throw new AccessError("Feedback not found", 404);
  if (!actor.isStaff) {
    if (!canSubmitFeedback(actor)) throw new AccessError("Your role has read-only access");
    if (ticket.reporter !== actor.name) throw new AccessError("You can only edit feedback you reported");
    if (!["Submitted", "Triaged", "Needs information"].includes(ticket.status)) {
      throw new AccessError("This feedback is already being worked on and can no longer be edited");
    }
  }
  const type = choice(input, "type", "Feedback type", TICKET_TYPES);
  const severity = choice(input, "severity", "Severity", SEVERITIES);
  const title = required(input, "title", "Title", 180);
  const actual = required(input, "actual", "Observed result", 5000);
  const expected = required(input, "expected", "Expected result", 5000);
  const pageUrl = safeUrl(input, "pageUrl", "Page URL");
  await enforceRateLimit(actor, "feedback:update", 120, 60);
  await db.prepare("UPDATE tickets SET type = ?, severity = ?, title = ?, actual = ?, expected = ?, page_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(type, severity, title, actual, expected, pageUrl, ticketId).run();
  await audit(db, "ticket", ticketId, "Feedback edited", actor, title);
}

export async function withdrawTicket(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const ticketId = required(input, "ticketId", "Feedback", 100);
  await assertTicketAccess(db, actor, ticketId);
  const ticket = await db.prepare("SELECT status, reporter FROM tickets WHERE id = ?").bind(ticketId).first<{ status: string; reporter: string }>();
  if (!ticket) throw new AccessError("Feedback not found", 404);
  if (ticket.status === "Withdrawn") throw new AccessError("This feedback is already withdrawn", 400);
  if (!actor.isStaff && ticket.reporter !== actor.name) throw new AccessError("You can only withdraw feedback you reported");
  if (!actor.isStaff && !canSubmitFeedback(actor)) throw new AccessError("Your role has read-only access");
  await enforceRateLimit(actor, "feedback:update", 120, 60);
  await db.prepare("UPDATE tickets SET status = 'Withdrawn', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ticketId).run();
  await audit(db, "ticket", ticketId, "Feedback withdrawn", actor);
  await queueTicketNotification(db, actor, ticketId, "withdrawn");
}

export async function markDuplicate(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  requireRole(actor, ["agency_admin", "project_manager", "developer"], "Only the delivery team can mark duplicates");
  const ticketId = required(input, "ticketId", "Feedback", 100);
  const duplicateKey = required(input, "duplicateKey", "Original feedback key", 40).toUpperCase();
  await assertTicketAccess(db, actor, ticketId);
  const ticket = await db.prepare("SELECT key FROM tickets WHERE id = ?").bind(ticketId).first<{ key: string }>();
  if (!ticket) throw new AccessError("Feedback not found", 404);
  if (ticket.key === duplicateKey) throw new AccessError("Feedback cannot duplicate itself", 400);
  const original = await db.prepare("SELECT id FROM tickets WHERE key = ?").bind(duplicateKey).first<{ id: string }>();
  if (!original) throw new AccessError("No feedback exists with that key", 404);
  await enforceRateLimit(actor, "feedback:update", 120, 60);
  await db.prepare("UPDATE tickets SET duplicate_of = ?, status = 'Closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(duplicateKey, ticketId).run();
  await audit(db, "ticket", ticketId, "Marked duplicate", actor, `Duplicate of ${duplicateKey}`);
}

export async function updateTicket(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const ticketId = required(input, "ticketId", "Feedback", 100);
  await assertTicketAccess(db, actor, ticketId);
  const allowed = new Map([["status", "status"], ["priority", "priority"], ["assignee", "assignee"], ["type", "type"], ["severity", "severity"]]);
  const field = required(input, "field", "Field", 40);
  const column = allowed.get(field);
  if (!column) throw new AccessError("Unsupported feedback update", 400);
  let value = required(input, "value", "Value", 120);
  if (field === "status" && !TICKET_STATUSES.has(value)) throw new AccessError("Choose a valid status", 400);
  if (field === "priority" && !PRIORITIES.has(value)) throw new AccessError("Choose a valid priority", 400);
  if (field === "type" && !TICKET_TYPES.has(value)) throw new AccessError("Choose a valid feedback type", 400);
  if (field === "severity" && !SEVERITIES.has(value)) throw new AccessError("Choose a valid severity", 400);
  if (field === "assignee") value = value.slice(0, 120);
  if (!actor.isStaff) {
    if (!["client_admin", "client_tester"].includes(actor.role)) throw new AccessError("Your role has read-only access");
    const current = await db.prepare("SELECT status FROM tickets WHERE id = ?").bind(ticketId).first<{ status: string }>();
    if (field !== "status" || !["Verified", "Reopened"].includes(value) || current?.status !== "Ready for retest") {
      throw new AccessError("Clients can only verify or reopen feedback that is ready for retest");
    }
  }
  await enforceRateLimit(actor, "feedback:update", 120, 60);
  await db.prepare(`UPDATE tickets SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(value, ticketId).run();
  await audit(db, "ticket", ticketId, `${field} changed`, actor, value);
  if (field === "status" && value === "Ready for retest") await queueTicketNotification(db, actor, ticketId, "retest");
  if (field === "status" && value === "Reopened") await queueTicketNotification(db, actor, ticketId, "reopened");
  if (field === "status" && value === "Verified") await queueTicketNotification(db, actor, ticketId, "verified");
}

export async function addComment(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  if (!actor.isStaff && !["client_admin", "client_tester"].includes(actor.role)) {
    throw new AccessError("Your role has read-only access");
  }
  const ticketId = required(input, "ticketId", "Feedback", 100);
  const body = required(input, "body", "Comment", 5000);
  await assertTicketAccess(db, actor, ticketId);
  const attachmentKey = optional(input, "attachmentKey", 100);
  if (attachmentKey) await validateAttachmentKey(attachmentKey, actor);
  await enforceRateLimit(actor, "comment:create", 60, 60);
  const visibility = actor.isStaff && input.visibility === "internal" ? "internal" : "public";
  const commentId = id("comment");
  await db.prepare("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)")
    .bind(commentId, ticketId, actor.name, body, visibility).run();
  if (attachmentKey) {
    await db.prepare("INSERT INTO attachments (id,ticket_id,comment_id,key,uploaded_by) VALUES (?,?,?,?,?)")
      .bind(id("attach"), ticketId, commentId, attachmentKey, actor.name).run();
  }
  await db.prepare("UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ticketId).run();
  await audit(db, "ticket", ticketId, visibility === "internal" ? "Internal note added" : "Reply sent", actor);
  if (visibility === "public") await queueTicketNotification(db, actor, ticketId, "comment");
  await queueMentionNotifications(db, actor, ticketId, body, visibility);
}

export async function createReplyTemplate(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  if (!actor.isStaff) throw new AccessError("Only the delivery team can manage reply templates");
  const title = required(input, "title", "Template name", 80);
  const body = required(input, "body", "Template text", 2000);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM reply_templates").first<{ count: number }>();
  if ((count?.count || 0) >= 50) throw new AccessError("Remove an unused template first (limit of 50)", 400);
  await enforceRateLimit(actor, "template:manage", 60, 60);
  const templateId = id("template");
  await db.prepare("INSERT INTO reply_templates (id,title,body,created_by) VALUES (?,?,?,?)")
    .bind(templateId, title, body, actor.name).run();
  await audit(db, "template", templateId, "Reply template added", actor, title);
  return templateId;
}

export async function deleteReplyTemplate(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  if (!actor.isStaff) throw new AccessError("Only the delivery team can manage reply templates");
  const templateId = required(input, "templateId", "Template", 100);
  const template = await db.prepare("SELECT title FROM reply_templates WHERE id = ?").bind(templateId).first<{ title: string }>();
  if (!template) throw new AccessError("Template not found", 404);
  await enforceRateLimit(actor, "template:manage", 60, 60);
  await db.prepare("DELETE FROM reply_templates WHERE id = ?").bind(templateId).run();
  await audit(db, "template", templateId, "Reply template removed", actor, template.title);
}

export async function updateProjectTeam(input: Record<string, string> & { memberIds?: string[] }, actor: Actor) {
  requireRole(actor, ["agency_admin", "project_manager"], "Only administrators and project managers can manage project teams");
  const db = await ensureDatabase();
  const projectId = required(input, "projectId", "Project", 100);
  const project = await db.prepare("SELECT name FROM projects WHERE id = ?").bind(projectId).first<{ name: string }>();
  if (!project) throw new AccessError("Project not found", 404);
  await assertProjectAccess(db, actor, projectId);
  const memberIds = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String))];
  if (memberIds.length > 30) throw new AccessError("A project team can have at most 30 members", 400);
  // A project manager setting a team is always part of it, so they cannot
  // lock themselves out of the project they are configuring.
  if (actor.role === "project_manager" && memberIds.length && !memberIds.includes(actor.id)) memberIds.push(actor.id);
  const staff = await db.prepare("SELECT id,name FROM members WHERE client_id IS NULL AND active = '1'").all<{ id: string; name: string }>();
  const staffById = new Map(staff.results.map((member) => [member.id, member.name]));
  for (const memberId of memberIds) {
    if (!staffById.has(memberId)) throw new AccessError("Project teams can only contain active internal teammates", 400);
  }
  await enforceRateLimit(actor, "project:team", 60, 60);
  await db.batch([
    db.prepare("DELETE FROM project_members WHERE project_id = ?").bind(projectId),
    ...memberIds.map((memberId) => db.prepare("INSERT INTO project_members (id,project_id,member_id,added_by) VALUES (?,?,?,?)").bind(id("pteam"), projectId, memberId, actor.name)),
  ]);
  await audit(db, "project", projectId, "Project team updated", actor, memberIds.length ? memberIds.map((memberId) => staffById.get(memberId)).join(", ") : "Team cleared — open to all teammates");
}

export async function saveScope(input: Record<string, string>, actor: Actor) {
  requireRole(actor, ["agency_admin", "project_manager", "client_admin"], "Only administrators, project managers and client admins can revise the scope of work");
  const db = await ensureDatabase();
  const projectId = required(input, "projectId", "Project", 100);
  await assertProjectAccess(db, actor, projectId);
  const body = required(input, "body", "Scope of work", 20000);
  const changeNote = optional(input, "changeNote", 300);
  const latest = await db.prepare("SELECT version, body FROM scope_versions WHERE project_id = ? ORDER BY version DESC LIMIT 1")
    .bind(projectId).first<{ version: number; body: string }>();
  if (latest && latest.body === body) throw new AccessError("Nothing changed — the text matches the current version", 400);
  if (latest && !changeNote) throw new AccessError("Describe what changed in this revision", 400);
  await enforceRateLimit(actor, "scope:save", 30, 60);
  const version = (latest?.version || 0) + 1;
  const versionId = id("scope");
  // Versions are append-only: revisions insert a new row and existing rows are
  // never updated or deleted, so the trail stays trustworthy.
  await db.prepare("INSERT INTO scope_versions (id,project_id,version,body,change_note,author,author_role) VALUES (?,?,?,?,?,?,?)")
    .bind(versionId, projectId, version, body, changeNote || "Initial agreed scope", actor.name, actor.role)
    .run();
  await audit(db, "scope", projectId, version === 1 ? "Scope of work recorded" : `Scope revised to v${version}`, actor, changeNote || "Initial agreed scope");
  return { versionId, version };
}

export async function savePhases(input: Record<string, string>, actor: Actor) {
  requireRole(actor, ["agency_admin", "project_manager"], "Only administrators and project managers can plan the project timeline");
  const db = await ensureDatabase();
  const projectId = required(input, "projectId", "Project", 100);
  const project = await db.prepare("SELECT name FROM projects WHERE id = ?").bind(projectId).first<{ name: string }>();
  if (!project) throw new AccessError("Project not found", 404);
  await assertProjectAccess(db, actor, projectId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.phases || "[]");
  } catch {
    throw new AccessError("Invalid timeline data", 400);
  }
  if (!Array.isArray(parsed)) throw new AccessError("Invalid timeline data", 400);
  if (parsed.length > 20) throw new AccessError("A timeline can have at most 20 phases", 400);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const phases = parsed.map((entry) => {
    const row = (entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {}) as Record<string, unknown>;
    const name = String(row.name || "").trim();
    const startDate = String(row.startDate || "").trim();
    const endDate = String(row.endDate || "").trim();
    const status = String(row.status || "Planned");
    const phaseId = typeof row.id === "string" && /^phase-[A-Za-z0-9-]{1,80}$/.test(row.id) ? row.id : "";
    if (!name || name.length > 80) throw new AccessError("Every phase needs a name of up to 80 characters", 400);
    if (!datePattern.test(startDate) || !datePattern.test(endDate) || Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) {
      throw new AccessError(`Give “${name}” a valid start and end date`, 400);
    }
    if (endDate < startDate) throw new AccessError(`“${name}” ends before it starts`, 400);
    if (!PHASE_STATUSES.has(status)) throw new AccessError("Choose a valid phase status", 400);
    return { id: phaseId, name, startDate, endDate, status };
  });
  const existing = await db.prepare("SELECT id,name,start_date,end_date,baseline_start,baseline_end FROM project_phases WHERE project_id = ?")
    .bind(projectId).all<{ id: string; name: string; start_date: string; end_date: string; baseline_start: string; baseline_end: string }>()
    .catch(() => ({ results: [] as { id: string; name: string; start_date: string; end_date: string; baseline_start: string; baseline_end: string }[] }));
  const existingById = new Map(existing.results.map((row) => [row.id, row]));
  await enforceRateLimit(actor, "project:timeline", 60, 60);
  await db.batch([
    db.prepare("DELETE FROM project_phases WHERE project_id = ?").bind(projectId),
    ...phases.map((phase, index) => {
      const prior = phase.id ? existingById.get(phase.id) : undefined;
      // The first agreed dates become the baseline and later edits keep it, so
      // the Gantt can show slippage against what was originally planned.
      return db.prepare("INSERT INTO project_phases (id,project_id,name,start_date,end_date,status,baseline_start,baseline_end,sort) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(prior ? phase.id : id("phase"), projectId, phase.name, phase.startDate, phase.endDate, phase.status,
          prior?.baseline_start || phase.startDate, prior?.baseline_end || phase.endDate, index);
    }),
  ]);
  const changes: string[] = [];
  for (const phase of phases) {
    const prior = phase.id ? existingById.get(phase.id) : undefined;
    if (!prior) changes.push(`Added ${phase.name} (${phase.startDate} to ${phase.endDate})`);
    else if (prior.start_date !== phase.startDate || prior.end_date !== phase.endDate) changes.push(`${phase.name} moved from ${prior.start_date}–${prior.end_date} to ${phase.startDate}–${phase.endDate}`);
  }
  const keptIds = new Set(phases.map((phase) => phase.id).filter(Boolean));
  for (const row of existing.results) {
    if (!keptIds.has(row.id)) changes.push(`Removed ${row.name}`);
  }
  await audit(db, "project", projectId, phases.length ? "Timeline updated" : "Timeline cleared", actor,
    changes.join("; ").slice(0, 500) || `${phases.length} phases confirmed`);
}

export async function updateChecklist(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const itemId = required(input, "itemId", "Checklist item", 100);
  const state = choice(input, "state", "Checklist state", CHECK_STATES);
  const item = await db.prepare("SELECT release_id FROM checklist_items WHERE id = ?").bind(itemId).first<{ release_id: string }>();
  if (!item) throw new AccessError("Checklist item not found", 404);
  await assertReleaseAccess(db, actor, item.release_id);
  if (!actor.isStaff && !["client_admin", "client_tester"].includes(actor.role)) throw new AccessError("Your role cannot update acceptance checks");
  await enforceRateLimit(actor, "checklist:update", 120, 60);
  await db.prepare("UPDATE checklist_items SET state = ? WHERE id = ?").bind(state, itemId).run();
  await audit(db, "checklist", itemId, "Checklist updated", actor, state);
}

export async function approveRelease(input: Record<string, string>, actor: Actor) {
  const db = await ensureDatabase();
  const releaseId = required(input, "releaseId", "Release", 100);
  await assertReleaseAccess(db, actor, releaseId);
  requireRole(actor, ["agency_admin", "project_manager", "client_admin"], "Only an authorised administrator can approve a release");
  const blockers = await db.prepare(`SELECT COUNT(*) AS count FROM tickets
    WHERE release_id = ? AND severity IN ('Critical','High')
    AND status NOT IN ('Verified','Closed','Deferred','Rejected / out of scope')`)
    .bind(releaseId).first<{ count: number }>();
  const incomplete = await db.prepare("SELECT COUNT(*) AS count FROM checklist_items WHERE release_id = ? AND state != 'Passed'")
    .bind(releaseId).first<{ count: number }>();
  if ((blockers?.count || 0) > 0 || (incomplete?.count || 0) > 0) {
    throw new AccessError("Resolve blocking feedback and pass every acceptance item before approval", 409);
  }
  await enforceRateLimit(actor, "release:approve", 10, 60);
  await db.prepare("UPDATE releases SET status = 'Approved', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?").bind(actor.name, releaseId).run();
  const exceptions = optional(input, "exceptions", 1000) || "No exceptions";
  await audit(db, "release", releaseId, "Release approved", actor, exceptions);
  try {
    const release = await db.prepare(`SELECT r.name, r.version, p.name AS project_name, p.client_id
      FROM releases r JOIN projects p ON p.id = r.project_id WHERE r.id = ?`)
      .bind(releaseId).first<{ name: string; version: string; project_name: string; client_id: string }>();
    if (release) {
      const recipients = [
        ...(await staffEmails(db, actor.email)),
        ...(await clientSideEmails(db, release.client_id, "", actor.email)),
      ];
      await queueNotificationEmail({
        recipients,
        subject: `Release approved: ${release.project_name} ${release.version}`,
        eyebrow: "DeliveryLoop acceptance",
        heading: "Release approved",
        copy: `${actor.name} approved “${release.name}” (${release.version}) on ${release.project_name}. Recorded exceptions: ${exceptions}.`,
        button: "Open release",
        path: "/",
        eventId: `approved:${releaseId}:${crypto.randomUUID()}`,
      });
      queueSlackMessage(`Release approved: ${actor.name} approved “${release.name}” (${release.version}) on ${release.project_name}. Exceptions: ${exceptions}.`);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "release_notification_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}

export async function canAccessAttachment(key: string, actor: Actor) {
  if (actor.isStaff) return true;
  const db = await ensureDatabase();
  const ticket = await db.prepare(`SELECT project_id FROM tickets WHERE attachment_key = ?1
    UNION SELECT t.project_id FROM attachments a JOIN tickets t ON t.id = a.ticket_id WHERE a.key = ?1`)
    .bind(key).first<{ project_id: string }>();
  if (!ticket) return false;
  return (await projectClientId(db, ticket.project_id)) === actor.clientId;
}

export function getUploads() {
  const bucket = bindings().UPLOADS;
  if (!bucket) throw new Error("Upload storage is unavailable");
  return bucket;
}
