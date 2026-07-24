import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const authSessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: text("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
}, (table) => [index("session_userId_idx").on(table.userId)]);

export const authAccounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: text("accessTokenExpiresAt"),
  refreshTokenExpiresAt: text("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
}, (table) => [index("account_userId_idx").on(table.userId)]);

export const authVerifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: text("expiresAt").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const authJwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: text("createdAt").notNull(),
  expiresAt: text("expiresAt"),
});

export const authRateLimits = sqliteTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("lastRequest").notNull(),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  accent: text("accent").notNull().default("#625BF6"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  clientId: text("client_id").references(() => clients.id),
  active: text("active").notNull().default("1"),
  // How much per-item mail this person wants. "standard" sends a client member
  // only what is actually theirs; "digest" and "none" take them out of the
  // per-ticket path entirely. Not a preferences screen in v1 — a sane default
  // that stops a client admin being copied on every ticket in their tenant.
  notifyMode: text("notify_mode").notNull().default("standard"),
  invitedBy: text("invited_by").notNull().default("System"),
  invitedAt: text("invited_at"),
  lastSeenAt: text("last_seen_at"),
  updatedAt: text("updated_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("members_client_idx").on(table.clientId)]);

export const rateLimitEvents = sqliteTable("rate_limit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull().references(() => members.id),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("rate_limit_actor_action_idx").on(table.actorId, table.action, table.createdAt)]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  manager: text("manager").notNull(),
  stage: text("stage").notNull().default("UAT"),
  stagingUrl: text("staging_url").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  version: text("version").notNull(),
  build: text("build").notNull(),
  status: text("status").notNull().default("Testing"),
  startDate: text("start_date").notNull(),
  dueDate: text("due_date").notNull(),
  testingNotes: text("testing_notes").notNull().default(""),
  // Throwaway credentials for the test environment, stored in plain text and
  // labelled as such in the UI. Shown to the client on their landing page so a
  // tester is never blocked at the sign-in screen of the thing they must test.
  testCredentials: text("test_credentials").notNull().default(""),
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id),
  title: text("title").notNull(),
  state: text("state").notNull().default("Not tested"),
  // Who moved the item to its current state, when, and why. Without these the
  // acceptance report cannot say who passed a flow — including when the agency
  // marked it passed on the client's behalf. `state_note` is mandatory for
  // "Waived", which is how a descoped Failed item exits without being falsified.
  stateBy: text("state_by").notNull().default(""),
  stateAt: text("state_at"),
  stateNote: text("state_note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Append-only acceptance evidence, one row per release.
 *
 * Approval used to live only on the releases row plus a free-text audit event,
 * so the recorded exceptions were read back by string-matching an audit label
 * and vanished once that event fell outside the audit read window. The open-item
 * and checklist snapshots are stored rather than recomputed, because tickets can
 * later be carried forward to another release.
 */
export const releaseApprovals = sqliteTable("release_approvals", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().unique(),
  approvedBy: text("approved_by").notNull(),
  approvedByMemberId: text("approved_by_member_id").notNull().default(""),
  approvedByRole: text("approved_by_role").notNull().default(""),
  onBehalfOf: text("on_behalf_of").notNull().default(""),
  approvedAt: text("approved_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  version: text("version").notNull().default(""),
  build: text("build").notNull().default(""),
  exceptions: text("exceptions").notNull().default(""),
  openItems: text("open_items").notNull().default("[]"),
  checklistSnapshot: text("checklist_snapshot").notNull().default("[]"),
  checklistPassed: integer("checklist_passed").notNull().default(0),
  checklistWaived: integer("checklist_waived").notNull().default(0),
  checklistTotal: integer("checklist_total").notNull().default(0),
});

/** Atomic per-project ticket sequence, replacing a read-max-then-insert race. */
export const projectCounters = sqliteTable("project_counters", {
  projectId: text("project_id").primaryKey(),
  nextTicket: integer("next_ticket").notNull().default(1),
});

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  projectId: text("project_id").notNull().references(() => projects.id),
  releaseId: text("release_id").notNull().references(() => releases.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  actual: text("actual").notNull(),
  expected: text("expected").notNull(),
  severity: text("severity").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull().default("Submitted"),
  reporter: text("reporter").notNull(),
  // Notification routing used to match `reporter` by display name, which is
  // neither unique nor stable. Backfilled best-effort; empty for legacy rows
  // whose reporter name no longer resolves to a member.
  reporterId: text("reporter_id").notNull().default(""),
  assignee: text("assignee").notNull().default("Unassigned"),
  pageUrl: text("page_url").notNull().default(""),
  // `browser` is the friendly string a person reads ("Chrome 138 · Windows");
  // `user_agent` is the raw header, kept for engineering only. The UI renders
  // the friendly one — a client has no use for a 140-character token soup.
  browser: text("browser").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  // Empty when nothing measured it. DeliveryLoop's own window size is not where
  // the bug was, so an uncaptured viewport stays blank rather than confidently
  // wrong; the drawer renders "Not captured" for it.
  viewport: text("viewport").notNull().default(""),
  build: text("build").notNull().default(""),
  attachmentKey: text("attachment_key"),
  duplicateOf: text("duplicate_of"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  commentId: text("comment_id"),
  key: text("key").notNull(),
  uploadedBy: text("uploaded_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("attachments_ticket_idx").on(table.ticketId)]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  author: text("author").notNull(),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("public"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const replyTemplates = sqliteTable("reply_templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const checklistTemplates = sqliteTable("checklist_templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  items: text("items").notNull(),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectMembers = sqliteTable("project_members", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  memberId: text("member_id").notNull(),
  addedBy: text("added_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("project_members_project_member_idx").on(table.projectId, table.memberId)]);

export const projectPhases = sqliteTable("project_phases", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("Planned"),
  baselineStart: text("baseline_start").notNull().default(""),
  baselineEnd: text("baseline_end").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("project_phases_project_idx").on(table.projectId)]);

export const scopeVersions = sqliteTable("scope_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  version: integer("version").notNull(),
  body: text("body").notNull(),
  changeNote: text("change_note").notNull().default(""),
  author: text("author").notNull(),
  authorRole: text("author_role").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("scope_versions_project_version_idx").on(table.projectId, table.version)]);

/**
 * Client-facing notices, both hand-written and lifecycle-generated.
 *
 * `kind` is the deletion gate: "announcement" is a person's post and can be
 * withdrawn, anything else ("testing_open", "retest_open") is the record that
 * the client was told a build was ready and is kept as evidence.
 */
export const announcements = sqliteTable("announcements", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  projectId: text("project_id").notNull().default(""),
  releaseId: text("release_id").notNull().default(""),
  kind: text("kind").notNull().default("announcement"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  author: text("author").notNull(),
  authorRole: text("author_role").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("announcements_client_idx").on(table.clientId, table.createdAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  details: text("details").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
