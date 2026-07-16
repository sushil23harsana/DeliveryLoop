import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id),
  title: text("title").notNull(),
  state: text("state").notNull().default("Not tested"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  assignee: text("assignee").notNull().default("Unassigned"),
  pageUrl: text("page_url").notNull().default(""),
  browser: text("browser").notNull().default(""),
  viewport: text("viewport").notNull().default(""),
  build: text("build").notNull().default(""),
  attachmentKey: text("attachment_key"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  author: text("author").notNull(),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("public"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  details: text("details").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
