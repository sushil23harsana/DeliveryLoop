import { env } from "cloudflare:workers";

type Bindings = { DB: D1Database; UPLOADS: R2Bucket };

function bindings(): Bindings {
  return env as unknown as Bindings;
}

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL, accent TEXT NOT NULL DEFAULT '#625BF6',
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
    attachment_key TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, author TEXT NOT NULL,
    body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    action TEXT NOT NULL, actor TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS tickets_project_idx ON tickets(project_id)`,
  `CREATE INDEX IF NOT EXISTS tickets_release_idx ON tickets(release_id)`,
  `CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status)`,
  `CREATE INDEX IF NOT EXISTS comments_ticket_idx ON comments(ticket_id)`,
];

export async function ensureDatabase() {
  const db = bindings().DB;
  if (!db) throw new Error("Database binding is unavailable");
  await db.batch(tableStatements.map((statement) => db.prepare(statement)));
  const count = await db.prepare("SELECT COUNT(*) AS count FROM clients").first<{ count: number }>();
  if (!count?.count) await seedDatabase(db);
  return db;
}

async function seedDatabase(db: D1Database) {
  const queries: D1PreparedStatement[] = [];
  const add = (sql: string, ...values: unknown[]) => queries.push(db.prepare(sql).bind(...values));

  add("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)", "client-northstar", "Northstar Retail", "Maya Chen", "maya@northstar.demo", "#7759F6");
  add("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)", "client-atlas", "Atlas Health", "Rohan Mehta", "rohan@atlas.demo", "#159A7B");
  add("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)", "client-veda", "Veda Finance", "Anika Rao", "anika@veda.demo", "#E7793F");

  add("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)", "project-northstar", "client-northstar", "Northstar Commerce", "NSC", "Unified commerce experience for web and retail teams.", "Aarav Patel", "UAT", "https://staging.northstar.demo");
  add("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)", "project-atlas", "client-atlas", "Atlas Patient Portal", "APP", "Secure patient scheduling and care-plan portal.", "Neha Kapoor", "UAT", "https://uat.atlas.demo");
  add("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)", "project-veda", "client-veda", "Veda Operations", "VOP", "Operations dashboard for reconciliation and payouts.", "Kabir Shah", "Internal QA", "https://preview.veda.demo");

  add("INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)", "release-checkout", "project-northstar", "Checkout & promotions UAT", "v1.8", "build-482", "Testing", "2026-07-14", "2026-07-22", "Please test guest checkout, saved addresses, coupons and failed-payment recovery.");
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
    ["ticket-1", "NSC-017", "project-northstar", "release-checkout", "Bug", "Coupon total is not refreshed after removal", "Removing a coupon leaves the discounted total visible until the page reloads.", "The total should immediately return to the original amount.", "High", "Urgent", "In progress", "Maya Chen", "Dev Malhotra", "/checkout", "Chrome 138 · macOS", "1440 × 900", "build-482"],
    ["ticket-2", "NSC-018", "project-northstar", "release-checkout", "Content", "Delivery estimate copy is unclear", "The message says ‘shortly’ without a date range.", "Show the estimated delivery date range used in the approved copy.", "Low", "Normal", "Submitted", "Maya Chen", "Unassigned", "/checkout/delivery", "Safari 18 · macOS", "1366 × 768", "build-482"],
    ["ticket-3", "NSC-019", "project-northstar", "release-checkout", "Change request", "Add GST number to guest checkout", "Guest checkout has no field for a company GST number.", "Allow business customers to provide a GST number.", "Medium", "Normal", "Approval required", "Vikram Sethi", "Aarav Patel", "/checkout/details", "Edge 138 · Windows", "1920 × 1080", "build-482"],
    ["ticket-4", "NSC-020", "project-northstar", "release-checkout", "Bug", "Saved address selection resets", "Selecting the second saved address resets after moving to payment.", "The selected address should remain active through payment.", "Critical", "Urgent", "Ready for retest", "Maya Chen", "Isha Verma", "/checkout/address", "Chrome 138 · Windows", "1536 × 864", "build-482"],
    ["ticket-5", "APP-031", "project-atlas", "release-booking", "Bug", "Reschedule shows old time in confirmation", "The appointment changes, but the success message displays the previous time.", "The confirmation should show the new appointment time.", "High", "High", "Ready for retest", "Rohan Mehta", "Sana Ali", "/appointments/42", "Chrome 138 · Windows", "1440 × 900", "build-219"],
    ["ticket-6", "APP-032", "project-atlas", "release-booking", "Content", "Reminder email uses internal clinic code", "The email footer displays AT-C4 instead of the clinic name.", "Display the public clinic name.", "Medium", "Normal", "In progress", "Rohan Mehta", "Sana Ali", "/notifications", "Firefox 140 · Windows", "1280 × 800", "build-219"],
    ["ticket-7", "APP-033", "project-atlas", "release-booking", "Question", "Can patients cancel within two hours?", "The cancellation button is disabled close to the appointment.", "Please confirm the agreed cancellation-window rule.", "Low", "Low", "Needs information", "Priya Nair", "Neha Kapoor", "/appointments/upcoming", "Safari 18 · iOS", "390 × 844", "build-219"],
    ["ticket-8", "VOP-006", "project-veda", "release-payouts", "Bug", "CSV preview rounds settlement totals", "Values with three decimals are shown rounded in the preview.", "Preview the exact imported value and round only final payable totals.", "Medium", "Normal", "Triaged", "QA Team", "Kabir Shah", "/settlements/import", "Chrome 138 · Windows", "1920 × 1080", "build-091"],
  ];
  for (const ticket of seededTickets) add("INSERT INTO tickets (id,key,project_id,release_id,type,title,actual,expected,severity,priority,status,reporter,assignee,page_url,browser,viewport,build) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ...ticket);

  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-1", "ticket-1", "Aarav Patel", "Confirmed and assigned. We can reproduce this when two promotions are evaluated together.", "public");
  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-2", "ticket-1", "Dev Malhotra", "Root cause is stale cart state after the remove mutation. Patch is in review.", "internal");
  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-3", "ticket-4", "Isha Verma", "The fix is available in build-483. Please retest the saved-address flow.", "public");
  add("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)", "comment-4", "ticket-5", "Sana Ali", "Updated in build-220 and ready for confirmation.", "public");

  add("INSERT INTO audit_events (id,entity_type,entity_id,action,actor,details) VALUES (?,?,?,?,?,?)", "audit-1", "release", "release-checkout", "Release opened for UAT", "Aarav Patel", "Northstar client testers invited");
  add("INSERT INTO audit_events (id,entity_type,entity_id,action,actor,details) VALUES (?,?,?,?,?,?)", "audit-2", "ticket", "ticket-4", "Ready for retest", "Isha Verma", "Fix deployed in build-483");
  await db.batch(queries);
}

export async function getWorkspace() {
  const db = await ensureDatabase();
  const [clients, projects, releases, checklist, tickets, comments, audit] = await Promise.all([
    db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM releases ORDER BY due_date ASC").all(),
    db.prepare("SELECT * FROM checklist_items ORDER BY created_at ASC").all(),
    db.prepare("SELECT * FROM tickets ORDER BY updated_at DESC, created_at DESC").all(),
    db.prepare("SELECT * FROM comments ORDER BY created_at ASC").all(),
    db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 50").all(),
  ]);
  return { clients: clients.results, projects: projects.results, releases: releases.results, checklist: checklist.results, tickets: tickets.results, comments: comments.results, audit: audit.results };
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function audit(db: D1Database, entityType: string, entityId: string, action: string, actor: string, details = "") {
  await db.prepare("INSERT INTO audit_events (id,entity_type,entity_id,action,actor,details) VALUES (?,?,?,?,?,?)")
    .bind(id("audit"), entityType, entityId, action, actor, details).run();
}

export async function createClient(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  const clientId = id("client");
  await db.prepare("INSERT INTO clients (id,name,contact_name,contact_email,accent) VALUES (?,?,?,?,?)")
    .bind(clientId, input.name, input.contactName, input.contactEmail, input.accent || "#625BF6").run();
  await audit(db, "client", clientId, "Client added", actor, input.name);
  return clientId;
}

export async function createProject(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  const projectId = id("project");
  await db.prepare("INSERT INTO projects (id,client_id,name,code,description,manager,stage,staging_url) VALUES (?,?,?,?,?,?,?,?)")
    .bind(projectId, input.clientId, input.name, input.code.toUpperCase(), input.description || "", input.manager, input.stage || "UAT", input.stagingUrl || "").run();
  await audit(db, "project", projectId, "Project created", actor, input.name);
  return projectId;
}

export async function createRelease(input: Record<string, string> & { checklist?: string[] }, actor: string) {
  const db = await ensureDatabase();
  const releaseId = id("release");
  await db.prepare("INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(releaseId, input.projectId, input.name, input.version, input.build, "Preparing", input.startDate, input.dueDate, input.testingNotes || "").run();
  for (const title of input.checklist || []) {
    if (title.trim()) await db.prepare("INSERT INTO checklist_items (id,release_id,title,state) VALUES (?,?,?,?)").bind(id("check"), releaseId, title.trim(), "Not tested").run();
  }
  await audit(db, "release", releaseId, "Release created", actor, input.name);
  return releaseId;
}

export async function createTicket(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  const project = await db.prepare("SELECT code FROM projects WHERE id = ?").bind(input.projectId).first<{ code: string }>();
  const existing = await db.prepare("SELECT key FROM tickets WHERE project_id = ?").bind(input.projectId).all<{ key: string }>();
  const nextNumber = existing.results.reduce((largest, row) => {
    const suffix = Number(row.key.split("-").pop());
    return Number.isFinite(suffix) ? Math.max(largest, suffix) : largest;
  }, 0) + 1;
  const key = `${project?.code || "UAT"}-${String(nextNumber).padStart(3, "0")}`;
  const ticketId = id("ticket");
  await db.prepare(`INSERT INTO tickets
    (id,key,project_id,release_id,type,title,actual,expected,severity,priority,status,reporter,assignee,page_url,browser,viewport,build,attachment_key)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(ticketId, key, input.projectId, input.releaseId, input.type, input.title, input.actual, input.expected, input.severity, "Normal", "Submitted", input.reporter || actor, "Unassigned", input.pageUrl || "", input.browser || "", input.viewport || "", input.build || "", input.attachmentKey || null).run();
  await audit(db, "ticket", ticketId, "Feedback submitted", actor, key);
  return { ticketId, key };
}

export async function updateTicket(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  const allowed = new Map([["status", "status"], ["priority", "priority"], ["assignee", "assignee"], ["type", "type"], ["severity", "severity"]]);
  const column = allowed.get(input.field);
  if (!column) throw new Error("Unsupported ticket update");
  await db.prepare(`UPDATE tickets SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(input.value, input.ticketId).run();
  await audit(db, "ticket", input.ticketId, `${input.field} changed`, actor, input.value);
}

export async function addComment(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  await db.prepare("INSERT INTO comments (id,ticket_id,author,body,visibility) VALUES (?,?,?,?,?)")
    .bind(id("comment"), input.ticketId, actor, input.body, input.visibility || "public").run();
  await db.prepare("UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.ticketId).run();
  await audit(db, "ticket", input.ticketId, input.visibility === "internal" ? "Internal note added" : "Reply sent", actor);
}

export async function updateChecklist(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  await db.prepare("UPDATE checklist_items SET state = ? WHERE id = ?").bind(input.state, input.itemId).run();
  await audit(db, "checklist", input.itemId, "Checklist updated", actor, input.state);
}

export async function approveRelease(input: Record<string, string>, actor: string) {
  const db = await ensureDatabase();
  const blockers = await db.prepare(`SELECT COUNT(*) AS count FROM tickets
    WHERE release_id = ? AND severity IN ('Critical','High')
    AND status NOT IN ('Verified','Closed','Deferred','Rejected / out of scope')`)
    .bind(input.releaseId).first<{ count: number }>();
  const incomplete = await db.prepare("SELECT COUNT(*) AS count FROM checklist_items WHERE release_id = ? AND state != 'Passed'")
    .bind(input.releaseId).first<{ count: number }>();
  if ((blockers?.count || 0) > 0 || (incomplete?.count || 0) > 0) {
    throw new Error("Resolve blocking feedback and pass every acceptance item before approval");
  }
  await db.prepare("UPDATE releases SET status = 'Approved', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?").bind(actor, input.releaseId).run();
  await audit(db, "release", input.releaseId, "Release approved", actor, input.exceptions || "No exceptions");
}

export function getUploads() {
  const bucket = bindings().UPLOADS;
  if (!bucket) throw new Error("Upload storage is unavailable");
  return bucket;
}
