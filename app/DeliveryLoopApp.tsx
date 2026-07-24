"use client";

import { ClipboardEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bookmark,
  Bug,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  GitCompare,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircleQuestion,
  MessageSquareWarning,
  MonitorSmartphone,
  Moon,
  PackageCheck,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Type,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { AuthScreen } from "./AuthScreen";
import { authClient } from "./auth-client";
import { parseBrowser, rawUserAgent } from "./capture";
import { CLOSED_TICKET_STATUSES } from "./shared-constants";

type Client = { id: string; name: string; contact_name: string; contact_email: string; accent: string; created_at: string };
type Member = { id: string; email: string; name: string; role: string; client_id: string | null; active: string; invited_by: string; invited_at: string | null; last_seen_at: string | null; updated_at: string | null; created_at: string };
type Project = { id: string; client_id: string; name: string; code: string; description: string; manager: string; stage: string; staging_url: string; created_at: string };
type Release = { id: string; project_id: string; name: string; version: string; build: string; status: string; start_date: string; due_date: string; testing_notes: string; test_credentials?: string; approved_at: string | null; approved_by: string | null; created_at: string };
type ChecklistItem = { id: string; release_id: string; title: string; state: string; state_by?: string; state_at?: string | null; state_note?: string; created_at: string };
type Ticket = { id: string; key: string; project_id: string; release_id: string; type: string; title: string; actual: string; expected: string; severity: string; priority: string; status: string; reporter: string; assignee: string; page_url: string; browser: string; user_agent?: string; viewport: string; build: string; attachment_key: string | null; duplicate_of: string | null; created_at: string; updated_at: string };
type Comment = { id: string; ticket_id: string; author: string; body: string; visibility: string; created_at: string };
type Attachment = { id: string; ticket_id: string; comment_id: string | null; key: string; uploaded_by: string; created_at: string };
type AuditEvent = { id: string; entity_type: string; entity_id: string; action: string; actor: string; details: string; created_at: string };
type ReplyTemplate = { id: string; title: string; body: string; created_by: string; created_at: string };
type ChecklistTemplate = { id: string; title: string; items: string; created_by: string; created_at: string };
type ScopeVersion = { id: string; project_id: string; version: number; body: string; change_note: string; author: string; author_role: string; created_at: string };
type ProjectTeamRow = { id: string; project_id: string; member_id: string; added_by: string; created_at: string };
type ProjectPhase = { id: string; project_id: string; name: string; start_date: string; end_date: string; status: string; baseline_start: string; baseline_end: string; sort: number; created_at: string };
type DirectoryProject = { id: string; client_id: string; name: string; code: string; stage: string; manager: string; team: string[] };
type Actor = { id: string; email: string; name: string; role: string; clientId: string | null; isStaff: boolean };
type ReleaseApproval = { id: string; release_id: string; approved_by: string; approved_by_role: string; on_behalf_of: string; approved_at: string; version: string; build: string; exceptions: string; open_items: string; checklist_snapshot: string; checklist_passed: number; checklist_waived: number; checklist_total: number };
// The two JSON columns on release_approvals, frozen at sign-off.
type ApprovalOpenItem = { key: string; title: string; severity: string; status: string };
type ChecklistSnapshotRow = { id: string; title: string; state: string; state_by: string; state_at: string | null; state_note: string };
// `kind` is "announcement" for a post somebody wrote and something else
// ("testing_open", "retest_open") when the release lifecycle wrote it. Only the
// former can be withdrawn — the server enforces that too.
type Announcement = { id: string; client_id: string; project_id: string; release_id: string; kind: string; title: string; body: string; author: string; author_role: string; created_at: string };
type Workspace = { clients: Client[]; members: Member[]; projects: Project[]; releases: Release[]; checklist: ChecklistItem[]; tickets: Ticket[]; comments: Comment[]; audit: AuditEvent[]; attachments: Attachment[]; templates: ReplyTemplate[]; scope: ScopeVersion[]; projectTeam: ProjectTeamRow[]; phases: ProjectPhase[]; checklistTemplates: ChecklistTemplate[]; approvals: ReleaseApproval[]; announcements: Announcement[]; directory: DirectoryProject[] };
type View = "home" | "overview" | "projects" | "timeline" | "releases" | "feedback" | "clients" | "reports" | "settings";
type Modal = "feedback" | "project" | "editProject" | "release" | "editRelease" | "client" | "member" | null;
type ActionPayload = Record<string, string | string[]>;
type ReportPrefill = { pageUrl?: string; viewport?: string };
type RunAction = (action: string, payload: ActionPayload, success: string, optimistic?: (workspace: Workspace) => Workspace) => Promise<boolean>;

// Shared with the server's approval blocker query so the gate the UI shows and
// the gate the server enforces cannot disagree.
const closedStatuses = new Set<string>(CLOSED_TICKET_STATUSES);
const statusOptions = ["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Reopened", "Verified", "Closed", "Deferred", "Rejected / out of scope", "Withdrawn"];

/**
 * The client-facing vocabulary.
 *
 * Twelve internal statuses are the delivery team's workflow, not the client's.
 * A tester does not need to know the difference between Submitted and Triaged —
 * both mean "they have it". These maps translate at the edge only: the stored
 * status, the CSS class and every server call stay on the internal value, so
 * nothing here can drift into the data model.
 */
const clientStatusLabel: Record<string, string> = {
  "Submitted": "Received",
  "Triaged": "Received",
  "In progress": "Being fixed",
  "Needs information": "Needs your input",
  "Approval required": "Awaiting your decision",
  "Ready for retest": "Ready to retest",
  "Reopened": "Being fixed again",
  "Verified": "Confirmed fixed",
  "Closed": "Done",
  "Deferred": "Agreed for later",
  "Rejected / out of scope": "Not in this scope",
  "Withdrawn": "Withdrawn by you",
};

const clientStatusGroups: { label: string; statuses: string[] }[] = [
  { label: "Ready to retest", statuses: ["Ready for retest"] },
  { label: "Needs your input", statuses: ["Needs information", "Approval required"] },
  { label: "With the team", statuses: ["Submitted", "Triaged", "In progress", "Reopened"] },
  { label: "Finished", statuses: ["Verified", "Closed"] },
  { label: "Not being done", statuses: ["Deferred", "Rejected / out of scope", "Withdrawn"] },
];

const boardColumns: { id: string; label: string; statuses: string[]; dropStatus: string }[] = [
  { id: "new", label: "New", statuses: ["Submitted", "Triaged"], dropStatus: "Triaged" },
  { id: "working", label: "In progress", statuses: ["In progress", "Needs information", "Approval required"], dropStatus: "In progress" },
  { id: "retest", label: "Client retest", statuses: ["Ready for retest", "Reopened"], dropStatus: "Ready for retest" },
  { id: "done", label: "Done", statuses: ["Verified", "Closed", "Deferred", "Rejected / out of scope", "Withdrawn"], dropStatus: "Closed" },
];

const feedbackTypes = ["Bug", "Change request", "Content", "Question"];

/** A screenshot chosen, dropped or pasted but not uploaded yet. */
type Shot = { file: File; url: string };

// Mirrors what app/api/uploads/route.ts enforces. Checked here too so the form
// keeps the promise it prints rather than uploading 40 MB before rejecting it.
const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 8 * 1024 * 1024;
const SHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * What the two free-text fields are actually asking, per feedback type.
 *
 * One pair of labels ("What happened?" / "What did you expect?") was used for
 * all four types, which made the second field meaningless on a Question and
 * nearly meaningless on a Content fix — yet both were mandatory. That is the
 * single biggest reason a tester reaches for a spreadsheet instead.
 *
 * `expected: null` hides the field entirely. The server applies the same rule
 * (see EXPECTATION_REQUIRED_TYPES in db/workspace.ts); this map only decides
 * what the form shows and what the browser will let through.
 */
const feedbackFields: Record<string, { actual: string; actualHint: string; expected: string | null; expectedHint: string; expectedRequired: boolean }> = {
  "Bug": { actual: "What happened?", actualHint: "What did you see, and how did you get there?", expected: "What did you expect?", expectedHint: "Describe the expected result", expectedRequired: true },
  "Change request": { actual: "What should change?", actualHint: "Which screen or behaviour is this about?", expected: "Why, or what should it do instead?", expectedHint: "The reason, or the behaviour you would like", expectedRequired: true },
  "Content": { actual: "Which text or image is wrong?", actualHint: "Quote the wording or name the image", expected: "Correct wording", expectedHint: "Optional — leave blank if the team should draft it", expectedRequired: false },
  "Question": { actual: "Your question", actualHint: "Ask the delivery team anything about this release", expected: null, expectedHint: "", expectedRequired: false },
};

function feedbackFieldsFor(type: string) {
  return feedbackFields[type] || feedbackFields["Bug"];
}

const staffNavigation = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "projects" as View, label: "Projects", icon: FolderKanban },
  { id: "timeline" as View, label: "Timeline", icon: CalendarRange },
  { id: "releases" as View, label: "Releases", icon: PackageCheck },
  { id: "feedback" as View, label: "Feedback", icon: MessageSquareWarning },
  { id: "clients" as View, label: "Clients & access", icon: Building2 },
  { id: "reports" as View, label: "Reports", icon: BarChart3 },
  { id: "settings" as View, label: "Team & security", icon: Settings2 },
];

const clientNavigation = [
  { id: "home" as View, label: "Your workspace", icon: LayoutDashboard },
  { id: "releases" as View, label: "Sign-off", icon: PackageCheck },
  { id: "feedback" as View, label: "Feedback", icon: MessageSquareWarning },
  { id: "projects" as View, label: "Project details", icon: FolderKanban },
  { id: "timeline" as View, label: "Timeline", icon: CalendarRange },
];

const clientAdminNavigation = { id: "clients" as View, label: "Team access", icon: Users };

function formatDate(value: string, includeYear = false) {
  if (!value) return "—";
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}) }).format(new Date(normalized));
}

/**
 * SQLite writes CURRENT_TIMESTAMP as `YYYY-MM-DD HH:MM:SS` in UTC with no zone
 * marker, which every browser would otherwise read as local time. Used wherever
 * the acceptance document has to state a time as well as a date.
 */
function formatStamp(value: string) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Reads one of the approval snapshot columns, tolerating an empty or bad value. */
function parseJsonRows<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

const DAY_MS = 86400000;

function dayNumber(date: string) {
  return Math.round(Date.parse(`${date.slice(0, 10)}T12:00:00Z`) / DAY_MS);
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function phaseBehind(phase: ProjectPhase, today: string) {
  return phase.status !== "Done" && phase.end_date < today;
}

function daysSince(value: string) {
  if (!value) return 0;
  const normalized = value.includes("T") || value.includes(" ") ? value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z") : `${value}T12:00:00Z`;
  const elapsed = Date.now() - new Date(normalized).getTime();
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86400000)) : 0;
}

function relTime(value: string) {
  const days = daysSince(value);
  return days === 0 ? "today" : `${days}d`;
}

function slaChip(ticket: Ticket): { tone: "client" | "team"; label: string } | null {
  if (closedStatuses.has(ticket.status)) return null;
  const days = daysSince(ticket.updated_at || ticket.created_at);
  if (days < 2) return null;
  if (["Ready for retest", "Needs information"].includes(ticket.status)) return { tone: "client", label: `Waiting on client ${days}d` };
  return { tone: "team", label: `With delivery team ${days}d` };
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

// Deterministic per-person avatar colour, matching the design system's hashing.
// Low chroma and a muted lightness keep these from competing with the single
// saturated accent the palette reserves for primary actions.
function avatarStyle(name: string): React.CSSProperties {
  let hue = 0;
  for (let i = 0; i < name.length; i++) hue = (hue * 31 + name.charCodeAt(i)) % 360;
  return { background: `oklch(0.42 0.06 ${hue})`, color: "#fff" };
}

function field(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

/** Lifecycle-written notices say so, rather than reading as somebody's post. */
function announcementKindLabel(kind: string) {
  return ({ testing_open: "Testing opened", retest_open: "New build to retest", announcement: "Announcement" } as Record<string, string>)[kind] || "Announcement";
}

function roleLabel(role: string) {
  return ({ agency_admin: "Agency admin", project_manager: "Project manager", developer: "Developer", client_admin: "Client admin", client_tester: "Client tester", client_viewer: "Client viewer" } as Record<string, string>)[role] || role;
}

/**
 * Picks the release a user should land on.
 *
 * getWorkspace returns releases ordered by due_date ASC, so the previous
 * `releases[0]` fallback selected the OLDEST release — a client signing in
 * landed on a stale or already-approved one. Prefer whatever is actually open
 * for testing, then the newest release still in progress.
 */
function pickDefaultRelease(releases: Release[]): Release | undefined {
  const active = releases.find((release) => release.status === "Testing" || release.status === "Retest");
  if (active) return active;
  const newestOpen = [...releases].reverse().find((release) => release.status !== "Approved");
  return newestOpen || releases[releases.length - 1];
}

/**
 * One CSV writer for both the staff portfolio export and the client's own
 * download. The staff version used to omit the project, the release and both
 * dates, so a row could not be placed in time or scope without the app open.
 *
 * `tickets` is whatever the caller already holds, which is tenant-scoped by the
 * server — this adds no visibility of its own.
 */
function exportTicketsCsv(tickets: Ticket[], filename: string, projects: Project[] = [], releases: Release[] = []) {
  const rows = [
    ["Key", "Project", "Release", "Title", "Type", "Severity", "Priority", "Status", "Reporter", "Assignee", "Created", "Updated"],
    ...tickets.map((ticket) => [
      ticket.key,
      projects.find((project) => project.id === ticket.project_id)?.code || "",
      releases.find((release) => release.id === ticket.release_id)?.version || "",
      ticket.title,
      ticket.type,
      ticket.severity,
      ticket.priority,
      ticket.status,
      ticket.reporter,
      ticket.assignee,
      ticket.created_at,
      ticket.updated_at,
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function scopeWorkspace(data: Workspace, clientId: string | null): Workspace {
  if (!clientId) return data;
  const clients = data.clients.filter((client) => client.id === clientId);
  const projects = data.projects.filter((project) => project.client_id === clientId);
  const projectIds = new Set(projects.map((project) => project.id));
  const releases = data.releases.filter((release) => projectIds.has(release.project_id));
  const releaseIds = new Set(releases.map((release) => release.id));
  const tickets = data.tickets.filter((ticket) => projectIds.has(ticket.project_id));
  const ticketIds = new Set(tickets.map((ticket) => ticket.id));
  const comments = data.comments.filter((comment) => ticketIds.has(comment.ticket_id) && comment.visibility === "public");
  // Mirrors the server's client scoping: an attachment inherits the visibility
  // of its parent comment, so a screenshot on an internal note must not appear
  // here either. Without this the staff preview shows more than the client sees.
  const publicCommentIds = new Set(comments.map((comment) => comment.id));
  return {
    clients,
    projects,
    releases,
    tickets,
    checklist: data.checklist.filter((item) => releaseIds.has(item.release_id)),
    comments,
    audit: data.audit.filter((event) => ticketIds.has(event.entity_id) || releaseIds.has(event.entity_id)),
    members: data.members.filter((member) => member.client_id === clientId),
    attachments: data.attachments.filter((attachment) =>
      ticketIds.has(attachment.ticket_id) && (!attachment.comment_id || publicCommentIds.has(attachment.comment_id))
    ),
    templates: [],
    scope: data.scope.filter((version) => projectIds.has(version.project_id)),
    projectTeam: [],
    phases: data.phases.filter((phase) => projectIds.has(phase.project_id)),
    checklistTemplates: [],
    approvals: (data.approvals || []).filter((approval) => releaseIds.has(approval.release_id)),
    announcements: (data.announcements || []).filter((announcement) =>
      announcement.client_id === clientId && (!announcement.project_id || projectIds.has(announcement.project_id))
    ),
    directory: [],
  };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(current); current = ""; }
    else current += char;
  }
  cells.push(current);
  return cells;
}

// Converts rows pasted from a spreadsheet (or an uploaded CSV) into the scope
// format: each row becomes a "- " deliverable bullet, cells joined with a dash,
// while recognised section headings are kept as-is.
function sheetToScope(text: string): string {
  const headingPattern = /^(deliverables|in scope|out of scope|scope|features|requirements|phase|milestones?|timeline|notes?)\b/i;
  const hasTabs = text.includes("\t");
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { out.push(""); continue; }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) { out.push(line); continue; }
    if (headingPattern.test(line) && !line.includes("\t")) { out.push(line); continue; }
    const cells = (hasTabs ? line.split("\t") : splitCsvLine(line)).map((cell) => cell.trim().replace(/^"|"$/g, "")).filter(Boolean);
    if (!cells.length) continue;
    out.push(`- ${cells.join(" — ")}`);
  }
  let result = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (result && !/^(deliverables|scope|in scope)/im.test(result)) result = `Deliverables\n${result}`;
  return result;
}

// Turns the agreed scope of work into draft acceptance-checklist flows: every
// bullet or numbered line under the deliverables becomes a testable item,
// while anything listed under "Out of scope" is skipped.
function checklistFromScope(body: string): string[] {
  const items: string[] = [];
  let outOfScope = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^out of scope/i.test(line)) { outOfScope = true; continue; }
    if (/^(deliverables|in scope|scope|features|requirements)/i.test(line)) { outOfScope = false; continue; }
    const match = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (match && !outOfScope && match[1].length <= 180) items.push(match[1]);
  }
  return items;
}

const feedbackIcons: Record<string, typeof Bug> = {
  Bug,
  "Change request": RefreshCcw,
  Content: Type,
  Question: MessageCircleQuestion,
};

export function DeliveryLoopApp() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [view, setView] = useState<View>("overview");
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [memberClientId, setMemberClientId] = useState<string | null>(null);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(null);
  const [teamProjectId, setTeamProjectId] = useState<string | null>(null);
  const [phaseProjectId, setPhaseProjectId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<{ status: number; message: string } | null>(null);
  const [boardMode, setBoardMode] = useState(false);
  const [myWork, setMyWork] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [seenMap, setSeenMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("dl-seen") || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  // Same shape and same failure handling as `dl-seen` above: a local record of
  // what this browser has already acknowledged. Read state deliberately has no
  // table in v1 — an announcement is a broadcast, not a per-person task.
  const [announceSeen, setAnnounceSeen] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("dl-announce-seen") || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("dl-theme");
    if (stored === "dark" || stored === "light") return stored;
    return "dark";
  });
  const [prefill, setPrefill] = useState<ReportPrefill | null>(null);
  const [printReleaseId, setPrintReleaseId] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const body = await response.json() as { workspace?: Workspace; actor?: Actor; error?: string };
    if (!response.ok || !body.workspace || !body.actor) {
      setAccessError({ status: response.status, message: body.error || "Unable to load workspace" });
      return;
    }
    setAccessError(null);
    setWorkspace(body.workspace);
    setActor(body.actor);
    setView((current) => {
      if (body.actor?.isStaff) return current;
      const canManageOwnTeam = body.actor?.role === "client_admin";
      if (current === "clients") return canManageOwnTeam ? current : "home";
      return current === "overview" || current === "reports" || current === "settings" ? "home" : current;
    });
    setSelectedReleaseId((current) => current || pickDefaultRelease(body.workspace?.releases || [])?.id || null);
    return body.workspace;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().then((loaded) => {
        if (!loaded) return;
        const params = new URLSearchParams(window.location.search);
        const ticketKey = params.get("ticket");
        if (ticketKey) {
          const ticket = loaded.tickets.find((item) => item.key.toLowerCase() === ticketKey.toLowerCase());
          if (ticket) {
            setView("feedback");
            setSelectedTicketId(ticket.id);
          }
        }
        if (params.get("report") === "1") {
          // The capture bookmarklet is generated per release and carries both
          // ids, so a report filed from a staging page lands on the release it
          // was actually testing rather than on whatever happened to be default.
          // Both are validated against the workspace this actor can see: an
          // unknown, mismatched or out-of-tenant id is ignored, never trusted.
          const projectParam = params.get("project") || "";
          const releaseParam = params.get("release") || "";
          const release = loaded.releases.find((item) => item.id === releaseParam);
          const projectKnown = !projectParam || loaded.projects.some((item) => item.id === projectParam);
          if (release && projectKnown && (!projectParam || release.project_id === projectParam) && release.status !== "Approved") {
            setSelectedReleaseId(release.id);
          }
          // Viewport is only ever the bookmarklet's measurement of the page under
          // test. Absent means absent — see the "Not captured" note on the form.
          setPrefill({ pageUrl: params.get("url") || undefined, viewport: params.get("vw") || undefined });
          setModal("feedback");
        }
        if (ticketKey || params.get("report")) window.history.replaceState(null, "", window.location.pathname);
      }).catch((error) => setAccessError({ status: 500, message: error instanceof Error ? error.message : "Unable to load workspace" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setSelectedTicketId(null); setModal(null); setScopeProjectId(null); setPhaseProjectId(null); setTeamProjectId(null); return; }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.key === "/") {
        event.preventDefault();
        setView("feedback");
        window.setTimeout(() => (document.querySelector(".search-box input") as HTMLInputElement | null)?.focus(), 50);
      }
      if (event.key.toLowerCase() === "n" && actor && (actor.isStaff || ["client_admin", "client_tester"].includes(actor.role))) {
        setModal("feedback");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actor]);

  // Opening the drawer marks the ticket read as of its latest update, so the
  // "New activity" dot only returns when someone else changes it afterwards.
  useEffect(() => {
    if (!selectedTicketId || !workspace) return;
    const ticket = workspace.tickets.find((item) => item.id === selectedTicketId);
    if (!ticket || seenMap[ticket.id] === ticket.updated_at) return;
    const timer = window.setTimeout(() => {
      setSeenMap((current) => {
        const next = { ...current, [ticket.id]: ticket.updated_at };
        try {
          window.localStorage.setItem("dl-seen", JSON.stringify(next));
        } catch {
          // Storage may be unavailable in private browsing; the dot just persists.
        }
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedTicketId, workspace, seenMap]);

  function dismissAnnouncement(announcementId: string) {
    setAnnounceSeen((current) => {
      const next = { ...current, [announcementId]: todayIso() };
      try {
        window.localStorage.setItem("dl-announce-seen", JSON.stringify(next));
      } catch {
        // Storage may be unavailable in private browsing; the banner just stays.
      }
      return next;
    });
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("dl-theme", next);
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3400);
  }

  async function runAction(action: string, payload: ActionPayload, success: string, optimistic?: (workspace: Workspace) => Workspace) {
    setBusy(true);
    if (optimistic) setWorkspace((current) => current ? optimistic(current) : current);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
      const body = await response.json() as { error?: string; result?: unknown };
      if (!response.ok) throw new Error(body.error || "Action failed");
      await load();
      setModal(null);
      setPrefill(null);
      notify(success);
      // Guided setup: creating a project leads straight into recording the
      // scope, and saving the first scope version leads into the timeline plan.
      if (actor?.isStaff) {
        if (action === "createProject" && typeof body.result === "string") {
          setScopeProjectId(body.result);
        } else if (action === "saveScope" && typeof payload.projectId === "string" && (body.result as { version?: number } | null)?.version === 1) {
          setScopeProjectId(null);
          setPhaseProjectId(payload.projectId);
        }
      }
      return true;
    } catch (error) {
      if (optimistic) await load().catch(() => undefined);
      notify(error instanceof Error ? error.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (accessError) return <AccessScreen error={accessError} />;
  if (!workspace || !actor) return <LoadingScreen />;

  const fullWorkspace = workspace;
  const isClientView = !actor.isStaff || Boolean(previewClientId);
  const activeClientId = actor.clientId || previewClientId;
  const data = actor.isStaff && previewClientId ? scopeWorkspace(workspace, previewClientId) : workspace;
  const activeClient = activeClientId ? workspace.clients.find((client) => client.id === activeClientId) : null;
  const projectById = (id: string) => data.projects.find((project) => project.id === id);
  const clientById = (id: string) => data.clients.find((client) => client.id === id);
  const releaseById = (id: string) => data.releases.find((release) => release.id === id);
  const selectedRelease = data.releases.find((release) => release.id === selectedReleaseId) || pickDefaultRelease(data.releases);
  const selectedTicket = data.tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  const openTickets = data.tickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const blockers = openTickets.filter((ticket) => ticket.severity === "Critical" || ticket.severity === "High");
  const retest = data.tickets.filter((ticket) => ticket.status === "Ready for retest");
  const testingReleases = data.releases.filter((release) => ["Testing", "Retest"].includes(release.status));
  const readOnlyPreview = Boolean(previewClientId);
  // For staff this is the inbox size. For a client it must only count what they
  // actually owe — a badge reading "23" when they owe nothing trains them to
  // ignore it.
  const feedbackBadge = isClientView
    ? data.tickets.filter((ticket) => ticket.status === "Ready for retest" || (ticket.reporter === actor.name && ["Needs information", "Approval required"].includes(ticket.status))).length
    : openTickets.length;
  const canReport = !readOnlyPreview && (actor.isStaff || ["client_admin", "client_tester"].includes(actor.role));
  const canManageClientMembers = !actor.isStaff && actor.role === "client_admin";
  const canManageClients = actor.role === "agency_admin";
  const canManageDelivery = actor.role === "agency_admin" || actor.role === "project_manager";
  const navigation = isClientView ? [...clientNavigation, ...(canManageClientMembers ? [clientAdminNavigation] : [])] : staffNavigation;
  const staffMembers = fullWorkspace.members.filter((member) => !member.client_id && member.active === "1");
  const assigneesForProject = (projectId: string) => {
    const teamIds = new Set((fullWorkspace.projectTeam || []).filter((row) => row.project_id === projectId).map((row) => row.member_id));
    const pool = teamIds.size ? staffMembers.filter((member) => teamIds.has(member.id)) : staffMembers;
    return ["Unassigned", ...new Set(pool.map((member) => member.name))];
  };
  const printRelease = printReleaseId ? data.releases.find((release) => release.id === printReleaseId) : null;

  const unreadIds = new Set(data.tickets.filter((ticket) => seenMap[ticket.id] !== ticket.updated_at).map((ticket) => ticket.id));
  // In client view the filter values are the five plain-language groups, so a
  // match is set membership rather than string equality against one status.
  const clientFilterStatuses = isClientView ? clientStatusGroups.find((group) => group.label === statusFilter)?.statuses : undefined;
  const visibleTickets = data.tickets.filter((ticket) => {
    const project = data.projects.find((item) => item.id === ticket.project_id);
    const searchable = `${ticket.key} ${ticket.title} ${ticket.reporter} ${project?.name || ""}`.toLowerCase();
    if (myWork && ticket.assignee !== actor.name && ticket.reporter !== actor.name) return false;
    if (statusFilter !== "All statuses") {
      if (isClientView ? !clientFilterStatuses?.includes(ticket.status) : ticket.status !== statusFilter) return false;
    }
    return searchable.includes(query.toLowerCase());
  });

  function changePreview(value: string) {
    const nextClientId = value || null;
    setPreviewClientId(nextClientId);
    setView(nextClientId ? "releases" : "overview");
    setSelectedTicketId(null);
    // Staff and client status filters are different vocabularies, so a filter
    // carried across the boundary would match nothing.
    setStatusFilter("All statuses");
    // Preparing releases are invisible to the client, so previewing one would
    // show a release they cannot actually see.
    const visible = nextClientId
      ? fullWorkspace.releases.filter((item) => fullWorkspace.projects.find((project) => project.id === item.project_id)?.client_id === nextClientId && item.status !== "Preparing")
      : fullWorkspace.releases;
    setSelectedReleaseId(pickDefaultRelease(visible)?.id || null);
  }

  function openMemberModal(clientId: string) {
    setMemberClientId(clientId);
    setModal("member");
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => { setPreviewClientId(null); setView("overview"); }} aria-label="DeliveryLoop home">
          <span className="brand-symbol"><span /></span>
          <span><b>DeliveryLoop</b><small>Client delivery</small></span>
        </button>

        <div className="workspace-context">
          <span>{isClientView ? "Client workspace" : "Agency workspace"}</span>
          <strong>{activeClient?.name || "All client projects"}</strong>
        </div>

        <nav className="side-nav" aria-label="Primary navigation">
          <p className="nav-label">{isClientView ? "Your workspace" : "Workspace"}</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setSelectedTicketId(null); }}>
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === "feedback" && feedbackBadge ? <em>{feedbackBadge}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {actor.isStaff ? (
            <label className="preview-control">
              <span><Eye size={14} /> Preview client portal</span>
              <select value={previewClientId || ""} onChange={(event) => changePreview(event.target.value)}>
                <option value="">Off</option>
                {workspace.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
          ) : null}
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <div className="account-row">
            <span className="avatar" style={avatarStyle(actor.name)}>{initials(actor.name)}</span>
            <div><strong>{actor.name}</strong><small>{roleLabel(actor.role)}</small></div>
            <button className="account-signout" onClick={signOut} aria-label="Sign out" title="Sign out"><LockKeyhole size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        {previewClientId ? (
          <div className="preview-banner">
            <span><Eye size={14} /> Read-only preview of {activeClient?.name || "the client"}&rsquo;s portal — nothing you click here writes data</span>
            <button onClick={() => changePreview("")}>Exit preview</button>
          </div>
        ) : null}
        <header className="topbar">
          <div>
            <p>{isClientView ? activeClient?.name || "Client workspace" : "Delivery operations"}</p>
            <h1>{pageTitle(view, isClientView)}</h1>
          </div>
          {canReport ? <div className="kbd-hints"><kbd>/</kbd><span>search</span><kbd>n</kbd><span>new feedback</span></div> : null}
          <div className="top-actions">
            {!isClientView && view === "projects" && canManageDelivery ? <button className="primary-button" onClick={() => setModal("project")}><Plus size={15} /> New project</button> : null}
            {!isClientView && view === "clients" && canManageClients ? <button className="primary-button" onClick={() => setModal("client")}><Plus size={15} /> New client</button> : null}
            {!isClientView && view === "releases" && canManageDelivery ? <button className="primary-button" onClick={() => setModal("release")}><Plus size={15} /> New release</button> : null}
            {!isClientView && view === "settings" && canManageClients ? <button className="primary-button" onClick={() => openMemberModal("agency")}><UserPlus size={15} /> Add teammate</button> : null}
            {(view === "feedback" || isClientView) && canReport ? <button className="primary-button" onClick={() => setModal("feedback")}><Plus size={15} /> Report feedback</button> : null}
          </div>
        </header>

        {view === "overview" && !isClientView ? (
          <Overview data={data} openTickets={openTickets} blockers={blockers} retest={retest} testingReleases={testingReleases} setView={setView} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} setSelectedTicketId={setSelectedTicketId} setModal={setModal} setScopeProjectId={setScopeProjectId} setPhaseProjectId={setPhaseProjectId} />
        ) : null}
        {view === "projects" ? <Projects data={data} isClientView={isClientView} canManageDelivery={canManageDelivery && !isClientView} clientById={clientById} setView={setView} setSelectedReleaseId={setSelectedReleaseId} setScopeProjectId={setScopeProjectId} setTeamProjectId={setTeamProjectId} editProject={(id) => { setEditProjectId(id); setModal("editProject"); }} notify={notify} /> : null}
        {view === "timeline" ? <TimelineView data={data} canManageDelivery={canManageDelivery && !isClientView} isClientView={isClientView} clientById={clientById} setPhaseProjectId={setPhaseProjectId} /> : null}
        {view === "home" ? <ClientHome data={data} actor={actor} release={selectedRelease} project={selectedRelease ? projectById(selectedRelease.project_id) : undefined} client={selectedRelease ? clientById(projectById(selectedRelease.project_id)?.client_id || "") : undefined} setView={setView} setSelectedTicketId={setSelectedTicketId} openReport={() => setModal("feedback")} canReport={canReport} notify={notify} readOnlyPreview={readOnlyPreview} announceSeen={announceSeen} dismissAnnouncement={dismissAnnouncement} /> : null}
        {view === "releases" ? <Releases data={data} actor={actor} isClientView={isClientView} selectedRelease={selectedRelease} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} runAction={runAction} busy={busy} setPrintReleaseId={setPrintReleaseId} setModal={setModal} notify={notify} readOnlyPreview={readOnlyPreview} /> : null}
        {view === "feedback" ? <Feedback data={data} tickets={visibleTickets} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} setSelectedTicketId={setSelectedTicketId} boardMode={boardMode} setBoardMode={setBoardMode} myWork={myWork} setMyWork={setMyWork} unreadIds={unreadIds} visibleCount={visibleCount} setVisibleCount={setVisibleCount} isStaff={actor.isStaff && !previewClientId} isClientView={isClientView} runAction={runAction} /> : null}
        {view === "clients" && (!isClientView || canManageClientMembers) ? <Clients data={data} actor={actor} openMemberModal={openMemberModal} runAction={runAction} busy={busy} notify={notify} /> : null}
        {view === "reports" && !isClientView ? <Reports data={data} /> : null}
        {view === "settings" && !isClientView ? <Settings data={data} actor={actor} openMemberModal={openMemberModal} runAction={runAction} busy={busy} notify={notify} /> : null}
      </main>

      {selectedTicket ? (
        <FeedbackDrawer ticket={selectedTicket} actor={actor} project={projectById(selectedTicket.project_id)} release={releaseById(selectedTicket.release_id)} comments={data.comments.filter((comment) => comment.ticket_id === selectedTicket.id)} attachments={data.attachments.filter((attachment) => attachment.ticket_id === selectedTicket.id)} audit={data.audit.filter((event) => event.entity_id === selectedTicket.id)} siblingTickets={data.tickets.filter((item) => item.project_id === selectedTicket.project_id && item.id !== selectedTicket.id)} openTicketByKey={(key) => { const target = data.tickets.find((item) => item.key === key); if (target) setSelectedTicketId(target.id); }} assigneeOptions={(() => { const options = assigneesForProject(selectedTicket.project_id); return options.includes(selectedTicket.assignee) ? options : [...options, selectedTicket.assignee]; })()} templates={fullWorkspace.templates || []} mentionNames={[...new Set([...fullWorkspace.members.filter((member) => member.active === "1").map((member) => member.name), selectedTicket.reporter, selectedTicket.assignee])].filter((name) => name && name !== "Unassigned" && name !== actor.name)} isClientView={isClientView} canRespond={canReport} close={() => setSelectedTicketId(null)} runAction={runAction} busy={busy} notify={notify} />
      ) : null}
      {phaseProjectId && projectById(phaseProjectId) ? (
        <PhaseModal project={projectById(phaseProjectId)!} phases={[...(fullWorkspace.phases || []).filter((phase) => phase.project_id === phaseProjectId)].sort((a, b) => a.sort - b.sort)} close={() => setPhaseProjectId(null)} runAction={runAction} busy={busy} />
      ) : null}
      {teamProjectId && projectById(teamProjectId) ? (
        <TeamModal project={projectById(teamProjectId)!} members={fullWorkspace.members} team={(fullWorkspace.projectTeam || []).filter((row) => row.project_id === teamProjectId)} actor={actor} close={() => setTeamProjectId(null)} runAction={runAction} busy={busy} />
      ) : null}
      {scopeProjectId && projectById(scopeProjectId) ? (
        <ScopePanel project={projectById(scopeProjectId)!} versions={(data.scope || []).filter((version) => version.project_id === scopeProjectId)} canEdit={["agency_admin", "project_manager", "client_admin"].includes(actor.role)} isClientView={isClientView} close={() => setScopeProjectId(null)} runAction={runAction} busy={busy} />
      ) : null}
      {modal ? (
        <ActionModal modal={modal} data={isClientView ? data : workspace} isClientView={isClientView} selectedRelease={selectedRelease} memberClientId={memberClientId} editProject={data.projects.find((project) => project.id === editProjectId)} prefill={prefill} close={() => { setModal(null); setPrefill(null); }} runAction={runAction} busy={busy} notify={notify} />
      ) : null}
      {printRelease ? (
        <AcceptanceReport release={printRelease} project={projectById(printRelease.project_id)} client={clientById(projectById(printRelease.project_id)?.client_id || "")} checklist={data.checklist.filter((item) => item.release_id === printRelease.id)} tickets={data.tickets.filter((ticket) => ticket.release_id === printRelease.id)} approval={(data.approvals || []).find((row) => row.release_id === printRelease.id)} scope={(data.scope || []).filter((version) => version.project_id === printRelease.project_id)} members={data.members} actor={actor} close={() => setPrintReleaseId(null)} />
      ) : null}
      {toast ? <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div> : null}
    </div>
  );
}

function pageTitle(view: View, isClientView: boolean) {
  if (isClientView) return ({ home: "Your workspace", releases: "Release testing", feedback: "Feedback and retesting", projects: "Project details", timeline: "Project timeline", overview: "Overview", clients: "Access", reports: "Reports", settings: "Settings" } as Record<View, string>)[view];
  return ({ home: "Delivery overview", overview: "Delivery overview", projects: "Projects", timeline: "Delivery timeline", releases: "Release centre", feedback: "Feedback inbox", clients: "Clients and access", reports: "UAT reporting", settings: "Team and security" } as Record<View, string>)[view];
}

/**
 * The client's landing page.
 *
 * Clients used to land on the sign-off gate: a checklist of unlabelled flows and
 * three requirement rows they mostly cannot action, with no link to the thing
 * they were being asked to test. This answers the three questions a tester
 * actually arrives with — where do I test, what needs me, and how does this work.
 */
function ClientHome({ data, actor, release, project, client, setView, setSelectedTicketId, openReport, canReport, notify, readOnlyPreview, announceSeen, dismissAnnouncement }: {
  data: Workspace;
  actor: Actor;
  release?: Release;
  project?: Project;
  client?: Client;
  setView: (view: View) => void;
  setSelectedTicketId: (id: string) => void;
  openReport: () => void;
  canReport: boolean;
  notify: (message: string) => void;
  readOnlyPreview: boolean;
  announceSeen: Record<string, string>;
  dismissAnnouncement: (announcementId: string) => void;
}) {
  const releaseTickets = release ? data.tickets.filter((ticket) => ticket.release_id === release.id) : [];
  const checks = release ? data.checklist.filter((item) => item.release_id === release.id) : [];
  const passed = checks.filter((item) => item.state === "Passed" || item.state === "Waived").length;
  const percent = checks.length ? Math.round((passed / checks.length) * 100) : 0;
  const retests = releaseTickets.filter((ticket) => ticket.status === "Ready for retest");
  const needsInput = releaseTickets.filter((ticket) => ["Needs information", "Approval required"].includes(ticket.status) && ticket.reporter === actor.name);
  const untested = checks.filter((item) => item.state === "Not tested");
  const myOpen = data.tickets.filter((ticket) => ticket.reporter === actor.name && !closedStatuses.has(ticket.status));
  const mine = data.tickets.filter((ticket) => ticket.reporter === actor.name);
  // Uses the codebase's existing day-number idiom rather than Date.now(), which
  // React's purity rule rejects during render.
  const daysLeft = release ? dayNumber(release.due_date) - dayNumber(todayIso()) : 0;
  const credentialLines = (release?.test_credentials || "").split("\n").map((line) => line.trim()).filter(Boolean);
  // Server-ordered newest first, so the first undismissed row is the one that
  // deserves the banner. Everything else is history the client can scroll back
  // through — nothing here is ever hidden by dismissing it.
  const announcements = data.announcements || [];
  const banner = announcements.find((announcement) => !announceSeen[announcement.id]);
  const announcementHistory = announcements.slice(0, 12);
  const notices = <>
    {banner ? <section className="announcement-banner">
      <span className="announcement-icon"><Megaphone size={16} /></span>
      <div>
        <p className="announcement-kind">{announcementKindLabel(banner.kind)} · {banner.author} · {formatDate(banner.created_at, true)}</p>
        <b>{banner.title}</b>
        {banner.body ? <p className="rich-text">{banner.body}</p> : null}
      </div>
      <button className="announcement-dismiss" onClick={() => dismissAnnouncement(banner.id)} aria-label="Dismiss this announcement" title="Dismiss"><X size={15} /></button>
    </section> : null}
    {announcementHistory.length ? <section className="surface announcement-list">
      <header className="section-header"><div><p>From your delivery team</p><h2>Announcements</h2></div><Megaphone size={18} /></header>
      <ol>
        {announcementHistory.map((announcement) => <li key={announcement.id}>
          <p className="announcement-kind">{announcementKindLabel(announcement.kind)} · {announcement.author} · {formatDate(announcement.created_at, true)}</p>
          <b>{announcement.title}</b>
          {announcement.body ? <p className="rich-text">{announcement.body}</p> : null}
        </li>)}
      </ol>
    </section> : null}
  </>;

  if (!release) {
    return <div className="page-content client-home">
      {notices}
      <EmptyState icon={PackageCheck} title="Nothing to test yet"
        body="Your delivery team will post here and email you as soon as a release is ready for you to check." />
    </div>;
  }

  return <div className="page-content client-home">
    {notices}
    <section className="surface home-hero">
      <div>
        <p className="eyebrow">{client?.name} · {project?.name}</p>
        <h2>{release.name}</h2>
        <small>{release.version} · {release.build} · testing closes {formatDate(release.due_date, true)}{daysLeft >= 0 ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : " (window has closed)"}</small>
      </div>
      <div className="home-hero-actions">
        {project?.staging_url
          ? <a className="primary-button" href={project.staging_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open the test site</a>
          : <span className="home-hero-hint">Ask your delivery team for the test link</span>}
        {canReport ? <button className="secondary-button" onClick={openReport}><MessageSquareWarning size={15} /> Report something</button> : null}
      </div>
    </section>

    <section className="attention-band">
      <button className="surface attention-tile" onClick={() => setView("feedback")}>
        <span className="metric-icon tone-brand"><RefreshCw size={16} /></span>
        <b>{retests.length}</b>
        <small>Ready for you to retest</small>
      </button>
      <button className="surface attention-tile" onClick={() => setView("feedback")}>
        <span className="metric-icon tone-warning"><MessageSquareWarning size={16} /></span>
        <b>{needsInput.length}</b>
        <small>Waiting for your answer</small>
      </button>
      <button className="surface attention-tile" onClick={() => setView("releases")}>
        <span className="metric-icon tone-success"><ListChecks size={16} /></span>
        <b>{untested.length}</b>
        <small>Flows still to test</small>
      </button>
    </section>

    <section className="surface home-progress">
      <header className="section-header"><div><p>Acceptance progress</p><h2>{passed} of {checks.length} flows complete</h2></div><span className="fraction">{percent}%</span></header>
      <div className="checklist-meter"><i style={{ width: `${percent}%` }} /></div>
      <p className="home-progress-note">When every flow passes and no high-impact feedback is open, your client administrator can sign this release off from the Sign-off page.</p>
    </section>

    {release.testing_notes || credentialLines.length ? <section className="surface instruction-card">
      <header className="section-header"><div><p>From your delivery team</p><h2>How to test this release</h2></div><ClipboardList size={18} /></header>
      {release.testing_notes ? <p className="rich-text">{release.testing_notes}</p> : null}
      {credentialLines.length ? <div className="credential-row">
        <b>Test account</b>
        {credentialLines.map((line, index) => <code key={index}>{line}</code>)}
        <small>Test environment only — never use your real password here.</small>
      </div> : null}
    </section> : null}

    <section className="surface home-my-items">
      <header className="section-header"><div><p>Your reports</p><h2>Open items you raised</h2></div><span className="home-items-actions"><button className="quiet-button" onClick={() => exportTicketsCsv(mine, "my-feedback.csv", data.projects, data.releases)} disabled={!mine.length}><Download size={14} /> Download my feedback (CSV)</button><Inbox size={18} /></span></header>
      {myOpen.length
        ? <FeedbackTable tickets={myOpen.slice(0, 8)} projects={data.projects} onOpen={setSelectedTicketId} compact client />
        : <div className="compact-empty">You have not reported anything that is still open.</div>}
    </section>

    <section className="surface how-it-works">
      <header className="section-header"><div><p>How this works</p><h2>Four steps</h2></div></header>
      <ol className="how-steps">
        <li><b>Open the test site</b><small>Use the link above and work through the flows your team listed.</small></li>
        <li><b>Report what you find</b><small>One item per problem. Screenshots help most.</small></li>
        <li><b>We fix and mark it ready</b><small>You will be emailed when something is ready to re-check.</small></li>
        <li><b>You confirm, then sign off</b><small>Once everything passes, your administrator accepts the release.</small></li>
      </ol>
      <p className="role-note">{actor.role === "client_viewer"
        ? "You have view-only access. You can read everything your team reports, but cannot submit feedback or mark flows tested — ask your client administrator if you need to test."
        : actor.role === "client_admin"
          ? "As client administrator you can test flows, report feedback, manage your team's access, and sign the release off."
          : "You can test flows and report feedback. Sign-off is done by your client administrator."}</p>
    </section>

    {/* The staff Settings view is the only other place this renders, and no
        client role can reach it — so without this a client had no way to change
        the password they were invited with. Hidden in staff preview, which
        promises that nothing on this surface writes. */}
    {readOnlyPreview ? null : <AccountSecurity notify={notify} />}
  </div>;
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-symbol large"><span /></span><div><strong>DeliveryLoop</strong><small>Preparing your workspace</small></div></main>;
}

function AccessScreen({ error }: { error: { status: number; message: string } }) {
  return <AuthScreen status={error.status} message={error.message} />;
}

function Overview({ data, openTickets, blockers, retest, testingReleases, setView, setSelectedReleaseId, projectById, clientById, setSelectedTicketId, setModal, setScopeProjectId, setPhaseProjectId }: { data: Workspace; openTickets: Ticket[]; blockers: Ticket[]; retest: Ticket[]; testingReleases: Release[]; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; setSelectedTicketId: (id: string) => void; setModal: (modal: Modal) => void; setScopeProjectId: (id: string) => void; setPhaseProjectId: (id: string) => void }) {
  const verified = data.tickets.filter((ticket) => closedStatuses.has(ticket.status)).length;
  if (!data.releases.length) {
    const newestProject = data.projects[0];
    return <div className="page-content overview-page">
      <section className="onboarding surface">
        <header><p>Welcome to DeliveryLoop</p><h2>Set up your first client delivery loop</h2><small>One continuous path — from the client workspace to the agreed scope, the timeline and the first release your client tests and signs off.</small></header>
        <div className="onboarding-steps">
          <button onClick={() => setModal("client")}><span className={data.clients.length ? "step-num done" : "step-num"}>{data.clients.length ? <Check size={14} /> : "1"}</span><b>Create a client workspace</b><small>The company whose delivery you are running. Their testers only ever see their own work.</small></button>
          <button disabled={!data.clients.length} onClick={() => setModal("project")}><span className={data.projects.length ? "step-num done" : "step-num"}>{data.projects.length ? <Check size={14} /> : "2"}</span><b>Add a project</b><small>What you are building — its code (like ACM) numbers every feedback ticket.</small></button>
          <button disabled={!newestProject} onClick={() => newestProject && setScopeProjectId(newestProject.id)}><span className={data.scope.length ? "step-num done" : "step-num"}>{data.scope.length ? <Check size={14} /> : "3"}</span><b>Record the agreed scope</b><small>Paste it from your SOW sheet — every later revision is versioned and comparable.</small></button>
          <button disabled={!newestProject} onClick={() => newestProject && setPhaseProjectId(newestProject.id)}><span className={data.phases.length ? "step-num done" : "step-num"}>{data.phases.length ? <Check size={14} /> : "4"}</span><b>Plan the timeline</b><small>Phases on a Gantt — slippage against the agreed dates shows automatically.</small></button>
          <button disabled={!newestProject} onClick={() => setModal("release")}><span className="step-num">5</span><b>Prepare a release</b><small>The UAT checklist generates itself from the scope — clients test and sign off here.</small></button>
        </div>
        <p className="onboarding-hint"><ShieldCheck size={16} /> Then invite the client&apos;s testers under Clients &amp; access — they report feedback, you fix, they verify, and finally sign the release off.</p>
      </section>
    </div>;
  }
  const waiting = data.tickets.filter((ticket) => ["Ready for retest", "Approval required"].includes(ticket.status)).slice(0, 5);
  return <div className="page-content overview-page">
    <section className="summary-strip" aria-label="Delivery summary">
      <div><i className="metric-icon tone-brand"><PackageCheck size={16} /></i><span>Releases in UAT</span><strong>{testingReleases.length}</strong><small>{data.releases.length} releases tracked</small></div>
      <div><i className="metric-icon tone-danger"><MessageSquareWarning size={16} /></i><span>Open feedback</span><strong>{openTickets.length}</strong><small>{blockers.length} high impact</small></div>
      <div><i className="metric-icon tone-warning"><RefreshCcw size={16} /></i><span>Waiting on client</span><strong>{retest.length}</strong><small>ready for retest</small></div>
      <div><i className="metric-icon tone-success"><CheckCircle2 size={16} /></i><span>Closed this cycle</span><strong>{verified}</strong><small>{data.tickets.length ? Math.round((verified / data.tickets.length) * 100) : 0}% of cycle feedback</small></div>
    </section>

    <section className="content-grid">
      <article className="surface">
        <header className="section-header"><div><h2>Needs attention</h2></div><span className="result-count">high-impact open items</span></header>
        <div className="attention-rows">
          {blockers.slice(0, 6).map((ticket) => <button key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)}>
            <span className="row-key">{ticket.key}</span>
            <span className="row-title">{ticket.title}</span>
            <em className={`severity-flag ${ticket.severity.toLowerCase()}`}>{ticket.severity}</em>
            <StatusBadge value={ticket.status} />
            <time>{relTime(ticket.updated_at || ticket.created_at)}</time>
          </button>)}
          {!blockers.length ? <div className="compact-empty"><CheckCircle2 size={20} /><span><b>No release blockers</b><small>Everything is moving normally.</small></span></div> : null}
        </div>
      </article>

      <div className="side-stack">
        <article className="surface mini-panel">
          <h2>Active releases</h2>
          {testingReleases.map((release) => {
            const project = projectById(release.project_id); const client = clientById(project?.client_id || "");
            const checks = data.checklist.filter((item) => item.release_id === release.id); const passed = checks.filter((item) => item.state === "Passed").length;
            const percent = checks.length ? Math.round((passed / checks.length) * 100) : 0;
            return <button key={release.id} onClick={() => { setSelectedReleaseId(release.id); setView("releases"); }}>
              <span className="mini-release-line"><span className="mono-ver">{project?.code} {release.version}</span><b>{release.name}</b><small>{percent}%</small></span>
              <span className="mini-meter"><i style={{ width: `${percent}%` }} /></span>
              <span className="mini-sub">{client?.name} · checklist progress · due {formatDate(release.due_date)}</span>
            </button>;
          })}
          {!testingReleases.length ? <div className="compact-empty"><PackageCheck size={20} /><span><b>No releases in testing</b><small>Prepare one from the Releases page.</small></span></div> : null}
        </article>
        <article className="surface mini-panel">
          <h2>Waiting on client</h2>
          {waiting.map((ticket) => <button key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)}>
            <span className="waiting-row"><span className="row-key">{ticket.key}</span><b>{ticket.title}</b><StatusBadge value={ticket.status} /></span>
          </button>)}
          {!waiting.length ? <div className="compact-empty"><CheckCircle2 size={20} /><span><b>Nothing pending</b><small>No items are waiting on the client.</small></span></div> : null}
        </article>
        <article className="surface mini-panel">
          <h2>Recent activity</h2>
          <div className="activity-list">{data.audit.slice(0, 4).map((event) => <div key={event.id}><span><CircleDotIcon /></span><p><b>{event.action}</b><small>{event.actor} · {event.details || formatDate(event.created_at)}</small></p></div>)}</div>
        </article>
      </div>
    </section>
  </div>;
}

function CircleDotIcon() {
  return <span className="activity-dot" />;
}

function Projects({ data, isClientView, canManageDelivery, clientById, setView, setSelectedReleaseId, setScopeProjectId, setTeamProjectId, editProject, notify }: { data: Workspace; isClientView: boolean; canManageDelivery: boolean; clientById: (id: string) => Client | undefined; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void; setScopeProjectId: (id: string) => void; setTeamProjectId: (id: string) => void; editProject: (id: string) => void; notify: (message: string) => void }) {
  const memberNameById = new Map(data.members.map((member) => [member.id, member.name]));
  const [captureFor, setCaptureFor] = useState<{ project: Project; release: Release } | null>(null);
  const today = todayIso();
  return <div className="page-content"><div className="project-list">{data.projects.map((project) => {
    const client = clientById(project.client_id); const releases = data.releases.filter((release) => release.project_id === project.id); const tickets = data.tickets.filter((ticket) => ticket.project_id === project.id); const current = releases.find((release) => release.status !== "Approved") || releases[0];
    const scopeVersion = (data.scope || []).filter((version) => version.project_id === project.id).length;
    const behindCount = (data.phases || []).filter((phase) => phase.project_id === project.id && phaseBehind(phase, today)).length;
    const teamNames = (data.projectTeam || []).filter((row) => row.project_id === project.id).map((row) => memberNameById.get(row.member_id)).filter((name): name is string => Boolean(name));
    const openCount = tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length;
    return <article className="surface project-card" key={project.id}>
      <div className="project-card-head">
        <span className="project-code" style={{ background: client?.accent }}>{project.code}</span>
        <div><h2>{project.name}</h2><small>{client?.name}</small></div>
        <StatusBadge value={project.stage} />
      </div>
      <p className="project-desc">{project.description}</p>
      <div className="project-facts">
        <span className="lead-chip"><i style={avatarStyle(project.manager)}>{initials(project.manager)}</i>{project.manager}</span>
        <span><strong>{openCount}</strong> open feedback</span>
        <span>current <strong className="mono">{current?.version || "—"}</strong></span>
        {isClientView ? <span className="client-access-note"><ShieldCheck size={13} /> Your organisation only</span> : null}
      </div>
      {!isClientView ? <div className="project-team-row"><span className="project-team-label"><Users size={13} /> Team</span>{teamNames.length ? teamNames.map((name) => <span key={name} className="team-chip" title={name}><b style={avatarStyle(name)}>{initials(name)}</b><i>{name}</i></span>) : <span className="team-open-note">Open to all teammates</span>}{canManageDelivery ? <button className="quiet-button" onClick={() => setTeamProjectId(project.id)}><UserPlus size={13} /> Manage</button> : null}</div> : null}
      <div className="row-actions">
        {canManageDelivery && !isClientView ? <button className="quiet-button" title="Correct the name, lead, purpose or staging link" onClick={() => editProject(project.id)}><Pencil size={13} /> Edit</button> : null}<button className="quiet-button" title="Agreed scope of work with full version history" onClick={() => setScopeProjectId(project.id)}><FileText size={13} /> Scope{scopeVersion ? <em className="scope-version-chip">v{scopeVersion}</em> : null}</button>
        <button className="quiet-button" title="Phase plan and Gantt timeline" onClick={() => setView("timeline")}><CalendarRange size={13} /> Timeline{behindCount ? <em className="phase-risk-chip" title={`${behindCount} phase${behindCount === 1 ? " is" : "s are"} past the planned end date`}>{behindCount} behind</em> : null}</button>
        <button className="quiet-button" title="Install a bookmark that opens a prefilled feedback form from any staging page" onClick={() => current ? setCaptureFor({ project, release: current }) : notify("Prepare a release for this project first — the capture tool files against a specific release")}><Bookmark size={13} /> Capture tool</button>
        {project.staging_url ? <a href={project.staging_url} target="_blank" rel="noreferrer" className="quiet-button">Staging <ExternalLink size={13} /></a> : null}
        {current ? <button className="secondary-button" onClick={() => { setSelectedReleaseId(current.id); setView("releases"); }}>View release</button> : null}
      </div>
    </article>;
  })}</div>
  {!isClientView && data.directory?.length ? <section className="project-directory">
    <header className="section-header"><div><p>Rest of the agency</p><h2>Other projects in progress</h2></div></header>
    <div className="directory-grid">
      {data.directory.map((project) => <article key={project.id} className="directory-card">
        <div className="directory-top"><span className="directory-code">{project.code}</span><StatusBadge value={project.stage} /></div>
        <h3>{project.name}</h3>
        <p>{clientById(project.client_id)?.name || "Agency client"} · led by {project.manager}</p>
        <div className="directory-team">{project.team.length ? project.team.map((name) => <span key={name} className="team-chip" title={name}><b style={avatarStyle(name)}>{initials(name)}</b><i>{name}</i></span>) : <span className="team-open-note">Team not listed</span>}</div>
        <span className="directory-lock"><LockKeyhole size={12} /> Overview only — you are not on this project&apos;s team</span>
      </article>)}
    </div>
  </section> : null}
  {captureFor ? <BookmarkletPanel project={captureFor.project} release={captureFor.release} close={() => setCaptureFor(null)} notify={notify} /> : null}
  </div>;
}

/**
 * How the capture tool actually gets installed.
 *
 * The whole install instruction used to be a 3.4-second toast saying the
 * bookmarklet had been copied. That fails twice over: Chrome and Safari strip a
 * `javascript:` URL pasted into the address bar, so the copied text cannot be
 * turned into a bookmark by the only route the toast implied — and the toast is
 * gone before anyone has opened their bookmarks bar. Dragging the link below is
 * the one path that reliably works in both browsers.
 *
 * The generated URL carries the project and the release, so a report filed from
 * a staging page lands on the release being tested. The old one carried neither
 * and filed against whatever release happened to be default.
 */
function BookmarkletPanel({ project, release, close, notify }: { project: Project; release: Release; close: () => void; notify: (message: string) => void }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // `var` and no arrow functions on purpose: this string is executed by whatever
  // the staging site is running in, which may be an old embedded webview.
  // The popup fallback matters — a click inside a bookmarklet is often not
  // treated as a user gesture, and a blocked window.open returns null silently,
  // leaving the tester convinced the tool is broken.
  const bookmarklet = `javascript:(function(){var t='${origin}/?report=1&project=${encodeURIComponent(project.id)}&release=${encodeURIComponent(release.id)}&url='+encodeURIComponent(location.href)+'&vw='+encodeURIComponent(innerWidth+' x '+innerHeight);var w=window.open(t,'_blank');if(!w)location.href=t;})();`;

  // React 19 rewrites a `javascript:` href to a throwing stub, so the attribute
  // is set on the DOM node directly. The anchor is inert to click either way —
  // it exists to be dragged to the bookmarks bar.
  useEffect(() => {
    linkRef.current?.setAttribute("href", bookmarklet);
  }, [bookmarklet]);

  async function copySource() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      notify("Bookmarklet copied — paste it into the URL field of a new bookmark, not the address bar");
    } catch {
      notify("Could not copy. Select the text in the box and copy it manually.");
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card bookmarklet-card" role="dialog" aria-modal="true" aria-label={`Capture tool for ${project.name}`}>
      <header><div><p>{project.name} · {release.version}</p><h2>Install the capture tool</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header>
      <div className="bookmarklet-body">
        <p className="bookmarklet-lead">A bookmark that opens a feedback form already filled in with the page you are on, its screen size, and this release.</p>
        <div className="bookmarklet-drag">
          <a ref={linkRef} className="bookmarklet-link" draggable onClick={(event) => event.preventDefault()}><Bookmark size={14} /> Report to {project.code}</a>
          <span>Drag this to your bookmarks bar</span>
        </div>
        <ol className="bookmarklet-steps">
          <li>Show your bookmarks bar — <b>Ctrl+Shift+B</b> on Windows, <b>⌘+Shift+B</b> on a Mac.</li>
          <li>Drag the orange button above onto that bar. It becomes a bookmark called “Report to {project.code}”.</li>
          <li>Open the staging site, get to the screen that is wrong, and click the bookmark.</li>
          <li>The feedback form opens with the page, screen size and release already filled in.</li>
        </ol>
        <div className="bookmarklet-note"><AlertCircle size={15} /><span><b>Screenshots are still yours to add.</b> A bookmark cannot take one. Press <b>Print Screen</b> (or <b>⌘+Shift+4</b> on a Mac), then paste into the form with <b>Ctrl+V</b> — it accepts pasted, dragged and chosen images.</span></div>
        <div className="bookmarklet-note"><ShieldCheck size={15} /><span><b>If nothing opens</b>, your browser blocked the pop-up. The tool falls back to opening in the same tab, so use the back button to return to the page you were testing.</span></div>
        <details className="bookmarklet-fallback">
          <summary>Dragging is not possible — copy it instead</summary>
          <p>Create a new bookmark by hand and paste this into its <b>URL</b> field. Pasting it into the address bar will not work: browsers strip the <code>javascript:</code> prefix there.</p>
          <textarea readOnly rows={3} value={bookmarklet} onFocus={(event) => event.currentTarget.select()} aria-label="Bookmarklet source" />
          <button type="button" className="secondary-button" onClick={copySource}><Copy size={13} /> Copy it</button>
        </details>
      </div>
      <footer><button type="button" className="quiet-button" onClick={close}>Done</button></footer>
    </section>
  </div>;
}

function TimelineView({ data, canManageDelivery, isClientView, clientById, setPhaseProjectId }: { data: Workspace; canManageDelivery: boolean; isClientView: boolean; clientById: (id: string) => Client | undefined; setPhaseProjectId: (id: string) => void }) {
  const today = todayIso();
  const todayNum = dayNumber(today);
  const allPhases = data.phases || [];
  const phasedProjectIds = new Set(allPhases.map((phase) => phase.project_id));

  // The chart spans every planned date (baselines included) plus release due
  // dates and today, padded so bars never touch the edges.
  let min = todayNum;
  let max = todayNum;
  for (const phase of allPhases) {
    min = Math.min(min, dayNumber(phase.start_date), phase.baseline_start ? dayNumber(phase.baseline_start) : todayNum);
    max = Math.max(max, dayNumber(phase.end_date), phase.baseline_end ? dayNumber(phase.baseline_end) : todayNum);
  }
  for (const release of data.releases) {
    if (phasedProjectIds.has(release.project_id)) max = Math.max(max, dayNumber(release.due_date));
  }
  min -= 4;
  max += 6;
  const span = max - min;
  const pos = (date: string) => ((dayNumber(date) - min) / span) * 100;

  const months: { left: number; label: string }[] = [];
  const first = new Date(min * DAY_MS);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  for (let guard = 0; guard < 40; guard++) {
    const monthStart = Math.round(Date.UTC(year, month, 1, 12) / DAY_MS);
    if (monthStart > max) break;
    if (monthStart >= min) {
      months.push({
        left: ((monthStart - min) / span) * 100,
        label: new Intl.DateTimeFormat("en-IN", { month: "short", ...(months.length === 0 || month === 0 ? { year: "numeric" } : {}) }).format(new Date(Date.UTC(year, month, 1, 12))),
      });
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }

  if (!data.projects.length) {
    return <div className="page-content"><EmptyState icon={CalendarRange} title="No projects yet" body="Create a project first, then plan its phases here." /></div>;
  }

  return <div className="page-content timeline-page">
    <div className="timeline-legend surface">
      <span><i className="legend-swatch done" /> Done</span>
      <span><i className="legend-swatch active" /> In progress</span>
      <span><i className="legend-swatch planned" /> Planned</span>
      <span><i className="legend-swatch overdue" /> Past planned end</span>
      <span><i className="legend-swatch baseline" /> Originally agreed dates</span>
      <span><i className="legend-swatch release" /> Release due</span>
    </div>
    {data.projects.map((project) => {
      const client = clientById(project.client_id);
      const phases = [...allPhases.filter((phase) => phase.project_id === project.id)].sort((a, b) => a.sort - b.sort);
      const releases = data.releases.filter((release) => release.project_id === project.id);
      const behind = phases.filter((phase) => phaseBehind(phase, today)).length;
      return <article className="surface timeline-lane" key={project.id}>
        <header className="timeline-lane-head">
          <span className="lane-code" style={{ background: client?.accent }}>{project.code}</span>
          <div><h2>{project.name}</h2><small>{client?.name} · led by {project.manager}</small></div>
          {behind ? <em className="phase-risk-chip"><AlertTriangle size={12} /> {behind} phase{behind === 1 ? "" : "s"} behind plan</em> : null}
          {canManageDelivery ? <button className="quiet-button" onClick={() => setPhaseProjectId(project.id)}><Pencil size={13} /> {phases.length ? "Edit plan" : "Plan timeline"}</button> : null}
        </header>
        {phases.length ? <div className="gantt-scroll"><div className="gantt">
          <div className="gantt-names">
            <span className="gantt-names-head" />
            {phases.map((phase) => <span key={phase.id} className="gantt-name"><b>{phase.name}</b><small>{phase.status} · {formatDate(phase.start_date)} – {formatDate(phase.end_date)}</small></span>)}
            {releases.length ? <span className="gantt-name releases-label"><b>Releases</b></span> : null}
          </div>
          <div className="gantt-plot">
            <div className="gantt-months">{months.map((tick) => <span key={tick.label + tick.left} style={{ left: `${tick.left}%` }}>{tick.label}</span>)}</div>
            {months.map((tick) => <i key={`grid-${tick.left}`} className="gantt-gridline" style={{ left: `${tick.left}%` }} />)}
            {/* The Today label sits beside its line, but a month tick just to the
                right would collide with it, so it flips to the other side. */}
            {(() => {
              const todayLeft = pos(today);
              const collides = todayLeft > 88 || months.some((tick) => tick.left - todayLeft > 0 && tick.left - todayLeft < 8);
              return <span className="gantt-today" style={{ left: `${todayLeft}%` }}><i className={collides ? "flip" : ""}>Today</i></span>;
            })()}
            {phases.map((phase) => {
              const left = pos(phase.start_date);
              const width = Math.max(((dayNumber(phase.end_date) - dayNumber(phase.start_date) + 1) / span) * 100, 0.8);
              const behindPlan = phaseBehind(phase, today);
              const tone = behindPlan ? "overdue" : phase.status === "Done" ? "done" : phase.status === "In progress" ? "active" : "planned";
              const moved = phase.baseline_start && phase.baseline_end && (phase.baseline_start !== phase.start_date || phase.baseline_end !== phase.end_date);
              return <div className="gantt-track" key={phase.id}>
                {moved ? <span className="gantt-baseline" style={{ left: `${pos(phase.baseline_start)}%`, width: `${Math.max(((dayNumber(phase.baseline_end) - dayNumber(phase.baseline_start) + 1) / span) * 100, 0.8)}%` }} title={`Originally agreed: ${formatDate(phase.baseline_start)} – ${formatDate(phase.baseline_end, true)}`} /> : null}
                <span className={`gantt-bar ${tone}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${phase.name} · ${formatDate(phase.start_date)} – ${formatDate(phase.end_date, true)} · ${behindPlan ? "Past the planned end date" : phase.status}`}>
                  <b>{formatDate(phase.start_date)} – {formatDate(phase.end_date)}</b>
                </span>
              </div>;
            })}
            {releases.length ? <div className="gantt-track releases-track">
              {releases.map((release) => <span key={release.id} className={`gantt-release ${release.status === "Approved" ? "approved" : ""}`} style={{ left: `${pos(release.due_date)}%` }} title={`${release.version} · ${release.name} — due ${formatDate(release.due_date, true)} (${release.status})`}><i /><small>{release.version}</small></span>)}
            </div> : null}
          </div>
        </div></div> : <div className="timeline-empty">
          <CalendarRange size={18} />
          <span><b>No timeline planned yet</b><small>{canManageDelivery ? "Set the agreed phases — discovery, build, UAT, launch — or one single delivery window." : isClientView ? "Your delivery team has not published a timeline for this project yet." : "An admin or the project manager can plan the phases."}</small></span>
          {canManageDelivery ? <button className="secondary-button" onClick={() => setPhaseProjectId(project.id)}><Plus size={14} /> Plan timeline</button> : null}
        </div>}
      </article>;
    })}
    {isClientView ? <div className="client-help"><ShieldCheck size={17} /><span><b>This is your organisation&apos;s delivery plan.</b><small>Faded bars show the originally agreed dates whenever a phase has been re-planned.</small></span></div> : null}
  </div>;
}

type DraftPhase = { id: string; name: string; startDate: string; endDate: string; status: string };

function isoFromDay(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// Standard delivery plans so a timeline never has to be typed from scratch.
// Durations are calendar days; every phase starts the day after the previous
// one ends, anchored on the chosen start date.
const PHASE_PRESETS: { id: string; label: string; hint: string; phases: { name: string; days: number }[] }[] = [
  { id: "fast", label: "Fast-track MVP", hint: "Startup pace — scope to launch in about five weeks", phases: [
    { name: "Discovery & scope", days: 5 }, { name: "Design", days: 5 }, { name: "Build", days: 15 }, { name: "Client UAT", days: 7 }, { name: "Launch", days: 3 },
  ] },
  { id: "agile", label: "Agile sprints", hint: "Sprint 0 plus three two-week sprints, then hardening, UAT and launch", phases: [
    { name: "Sprint 0 — setup & backlog", days: 5 }, { name: "Sprint 1", days: 14 }, { name: "Sprint 2", days: 14 }, { name: "Sprint 3", days: 14 }, { name: "Hardening & client UAT", days: 7 }, { name: "Launch", days: 2 },
  ] },
  { id: "waterfall", label: "Waterfall", hint: "Fixed-scope contract flow — requirements through staged testing to launch", phases: [
    { name: "Requirements", days: 7 }, { name: "Design", days: 10 }, { name: "Development", days: 28 }, { name: "Internal QA", days: 10 }, { name: "Client UAT", days: 10 }, { name: "Launch", days: 3 },
  ] },
  { id: "single", label: "Single window", hint: "One delivery block — simplest possible plan", phases: [
    { name: "Delivery", days: 30 }, { name: "Client UAT & sign-off", days: 7 },
  ] },
];

function PhaseModal({ project, phases, close, runAction, busy }: { project: Project; phases: ProjectPhase[]; close: () => void; runAction: RunAction; busy: boolean }) {
  // A fresh timeline opens pre-filled with the agency default (Fast-track MVP)
  // starting today, so the common case is "adjust a date or two and save".
  const [rows, setRows] = useState<DraftPhase[]>(() => {
    if (phases.length) return phases.map((phase) => ({ id: phase.id, name: phase.name, startDate: phase.start_date, endDate: phase.end_date, status: phase.status }));
    let cursor = dayNumber(todayIso());
    return PHASE_PRESETS[0].phases.map((phase) => {
      const startDate = isoFromDay(cursor);
      const endDate = isoFromDay(cursor + phase.days - 1);
      cursor += phase.days;
      return { id: "", name: phase.name, startDate, endDate, status: "Planned" };
    });
  });
  const [presetStart, setPresetStart] = useState(todayIso());
  function applyPreset(preset: typeof PHASE_PRESETS[number]) {
    let cursor = dayNumber(presetStart || todayIso());
    setRows(preset.phases.map((phase) => {
      const startDate = isoFromDay(cursor);
      const endDate = isoFromDay(cursor + phase.days - 1);
      cursor += phase.days;
      return { id: "", name: phase.name, startDate, endDate, status: "Planned" };
    }));
  }
  function update(index: number, key: keyof DraftPhase, value: string) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }
  function addRow() {
    setRows((current) => [...current, { id: "", name: "", startDate: current[current.length - 1]?.endDate || "", endDate: "", status: "Planned" }]);
  }
  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }
  const cleaned = rows.filter((row) => row.name.trim() || row.startDate || row.endDate);
  const incomplete = cleaned.some((row) => !row.name.trim() || !row.startDate || !row.endDate);
  const misordered = cleaned.some((row) => row.startDate && row.endDate && row.endDate < row.startDate);
  async function save() {
    const payload = cleaned.map((row) => ({ ...(row.id ? { id: row.id } : {}), name: row.name.trim(), startDate: row.startDate, endDate: row.endDate, status: row.status }));
    const ok = await runAction("savePhases", { projectId: project.id, phases: JSON.stringify(payload) }, payload.length ? "Timeline saved" : "Timeline cleared");
    if (ok) close();
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card phase-card" role="dialog" aria-modal="true" aria-label={`Timeline for ${project.name}`}>
      <header><div><p>Project timeline</p><h2>{project.name}</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header>
      <div className="phase-shell">
        <div className="modal-callout"><CalendarRange size={17} /><span>The dates you first save become the agreed baseline. If a phase moves later, the Gantt keeps showing the original dates underneath — and every change is recorded with your name in the audit trail.</span></div>
        <div className="preset-row">
          <span className="preset-label">Start from a preset</span>
          <input type="date" value={presetStart} aria-label="Preset start date" onChange={(event) => setPresetStart(event.target.value)} />
          {PHASE_PRESETS.map((preset) => <button key={preset.id} type="button" className="quiet-button" title={preset.hint} disabled={busy} onClick={() => applyPreset(preset)}>{preset.label}{preset.id === "fast" ? <em className="scope-version-chip">Default</em> : null}</button>)}
        </div>
        <p className="phase-hint preset-hint">{phases.length ? "Presets replace the rows below with a standard plan starting on the chosen date." : "Pre-filled with the Fast-track MVP plan starting today — nudge dates, rename phases, or switch preset."}</p>
        <div className="phase-rows">
          <div className="phase-row phase-row-head"><span>Phase</span><span>Starts</span><span>Ends</span><span>Status</span><span /></div>
          {rows.map((row, index) => <div className="phase-row" key={row.id || `new-${index}`}>
            <input value={row.name} maxLength={80} placeholder={index === 0 ? "e.g. Discovery & design" : "Phase name"} aria-label={`Phase ${index + 1} name`} onChange={(event) => update(index, "name", event.target.value)} />
            <input type="date" value={row.startDate} aria-label={`Phase ${index + 1} start date`} onChange={(event) => update(index, "startDate", event.target.value)} />
            <input type="date" value={row.endDate} min={row.startDate || undefined} aria-label={`Phase ${index + 1} end date`} onChange={(event) => update(index, "endDate", event.target.value)} />
            <select value={row.status} aria-label={`Phase ${index + 1} status`} onChange={(event) => update(index, "status", event.target.value)}><option>Planned</option><option>In progress</option><option>Done</option></select>
            <button type="button" className="phase-remove" aria-label={`Remove phase ${index + 1}`} title="Remove phase" disabled={busy} onClick={() => removeRow(index)}><Trash2 size={14} /></button>
          </div>)}
        </div>
        <button type="button" className="quiet-button phase-add" disabled={busy || rows.length >= 20} onClick={addRow}><Plus size={14} /> Add phase</button>
        <p className="phase-hint">A single delivery window is just one phase. {misordered ? "One of the phases ends before it starts." : incomplete ? "Give every phase a name, start and end date." : ""}</p>
        <footer className="phase-footer">
          <span>{cleaned.length ? `${cleaned.length} phase${cleaned.length === 1 ? "" : "s"}` : "Saving with no phases clears the timeline"}</span>
          <div><button type="button" className="quiet-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy || incomplete || misordered} onClick={() => void save()}>{busy ? "Saving…" : "Save timeline"}</button></div>
        </footer>
      </div>
    </section>
  </div>;
}

function Releases({ data, actor, isClientView, selectedRelease, setSelectedReleaseId, projectById, clientById, runAction, busy, setPrintReleaseId, setModal, notify, readOnlyPreview }: { data: Workspace; actor: Actor; isClientView: boolean; selectedRelease?: Release; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; runAction: RunAction; busy: boolean; setPrintReleaseId: (id: string | null) => void; setModal: (modal: Modal) => void; notify: (message: string) => void; readOnlyPreview: boolean }) {
  const [newCheck, setNewCheck] = useState("");
  const [carrySelection, setCarrySelection] = useState<string[]>([]);
  const [carryTarget, setCarryTarget] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  if (!selectedRelease) return <div className="page-content"><EmptyState icon={PackageCheck} title="No releases yet" body={isClientView ? "Your delivery team has not opened a release for testing yet. You will be notified when one is ready." : "Create the first release to begin client UAT."} /></div>;
  const canManageChecklist = !isClientView && ["agency_admin", "project_manager"].includes(actor.role);
  const project = projectById(selectedRelease.project_id); const client = clientById(project?.client_id || "");
  const checks = data.checklist.filter((item) => item.release_id === selectedRelease.id);
  const releaseTickets = data.tickets.filter((ticket) => ticket.release_id === selectedRelease.id);
  const open = releaseTickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const blockers = open.filter((ticket) => ["Critical", "High"].includes(ticket.severity));
  // A waived item is a recorded descope, so it completes the gate — but it is
  // counted separately everywhere so nothing implies it was actually tested.
  const incomplete = checks.filter((item) => item.state !== "Passed" && item.state !== "Waived");
  const waived = checks.filter((item) => item.state === "Waived");
  const canApprove = blockers.length === 0 && incomplete.length === 0 && selectedRelease.status !== "Approved";
  const canSign = !readOnlyPreview && ["agency_admin", "project_manager", "client_admin"].includes(actor.role);
  const canTest = !readOnlyPreview && (actor.isStaff || ["client_admin", "client_tester"].includes(actor.role));
  // Read from the durable approval record, not by string-matching an audit
  // label: the audit feed is windowed, so exceptions used to vanish over time.
  const approval = (data.approvals || []).find((row) => row.release_id === selectedRelease.id);
  function setCheck(item: ChecklistItem, next: string) {
    if (next === item.state) return;
    void runAction("updateChecklist", { itemId: item.id, state: next }, `Updated “${item.title}”`, (workspace) => ({
      ...workspace,
      checklist: workspace.checklist.map((entry) => entry.id === item.id ? { ...entry, state: next } : entry),
    }));
  }
  // Waiving is a descope decision and needs a stated reason — a waiver without
  // one reads as authoritative while explaining nothing.
  const canWaive = ["agency_admin", "project_manager", "client_admin"].includes(actor.role);
  function waiveCheck(item: ChecklistItem) {
    const note = window.prompt(`Why is “${item.title}” being waived? This is recorded on the acceptance report.`, item.state_note || "");
    if (note === null) return;
    if (note.trim().length < 10) {
      notify("Record a reason of at least 10 characters to waive an item");
      return;
    }
    void runAction("updateChecklist", { itemId: item.id, state: "Waived", note: note.trim() }, `Waived “${item.title}”`, (workspace) => ({
      ...workspace,
      checklist: workspace.checklist.map((entry) => entry.id === item.id ? { ...entry, state: "Waived", state_note: note.trim() } : entry),
    }));
  }
  const passedCount = checks.filter((item) => item.state === "Passed").length;
  const checkPercent = checks.length ? Math.round((passedCount / checks.length) * 100) : 0;
  const checklistLocked = selectedRelease.status === "Approved";
  async function addCheckItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newCheck.trim();
    if (!title || !selectedRelease) return;
    const ok = await runAction("addChecklistItems", { releaseId: selectedRelease.id, checklist: [title] }, `Added “${title}” to the checklist`);
    if (ok) setNewCheck("");
  }
  // Only a release in the same project that is not already signed off can take
  // carried items; the server re-checks both, this is just what is offerable.
  const carryTargets = data.releases.filter((row) => row.project_id === selectedRelease.project_id && row.id !== selectedRelease.id && row.status !== "Approved");
  const canCarry = !readOnlyPreview && !isClientView && ["agency_admin", "project_manager"].includes(actor.role);
  // A client admin cannot move other people's work between releases, so they get
  // the list plus an explicit acknowledgement instead of the carry controls.
  const needsAcknowledgement = !canCarry && open.length > 0;
  const projectScope = [...(data.scope || []).filter((version) => version.project_id === selectedRelease.project_id)].sort((a, b) => a.version - b.version);
  const currentScope = projectScope.length ? projectScope[projectScope.length - 1] : undefined;
  function toggleCarry(ticketId: string) {
    setCarrySelection((current) => current.includes(ticketId) ? current.filter((entry) => entry !== ticketId) : [...current, ticketId]);
  }
  // Announcements are composed here rather than behind a nav item of their own:
  // almost everything worth telling a client belongs to the release they are
  // testing, and a separate destination would go unvisited.
  const projectAnnouncements = (data.announcements || []).filter((announcement) => announcement.project_id === selectedRelease.project_id);
  async function postAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRelease || !announceTitle.trim()) return;
    const ok = await runAction("createAnnouncement", { projectId: selectedRelease.project_id, releaseId: selectedRelease.id, title: announceTitle.trim(), body: announceBody.trim() }, "Announcement posted to the client");
    if (ok) { setAnnounceTitle(""); setAnnounceBody(""); }
  }
  async function settleOpenItems(disposition: "move" | "defer") {
    if (!selectedRelease || !carrySelection.length) return;
    const payload: ActionPayload = { releaseId: selectedRelease.id, disposition, ticketIds: carrySelection };
    if (disposition === "move") payload.targetReleaseId = carryTarget;
    const ok = await runAction("carryForwardTickets", payload, disposition === "move"
      ? `${carrySelection.length} open item(s) carried forward`
      : `${carrySelection.length} open item(s) deferred by agreement`);
    if (ok) setCarrySelection([]);
  }
  return <div className="page-content release-page">
    <aside className="release-index"><p>Release history</p>{data.releases.map((release) => <button key={release.id} className={release.id === selectedRelease.id ? "active" : ""} onClick={() => setSelectedReleaseId(release.id)}><span className={`release-dot ${release.status.toLowerCase()}`} /><span><b>{release.version}</b><small>{release.name}</small></span><time>{formatDate(release.due_date)}</time></button>)}</aside>
    <section className="release-content">
      <article className="release-summary surface"><div className="release-summary-top"><div className="release-title"><span style={{ background: client?.accent }}>{initials(client?.name || "CL")}</span><div><p>{client?.name} / {project?.name}</p><h2>{selectedRelease.name}</h2><small>{selectedRelease.version} · {selectedRelease.build}</small></div></div><span className="release-summary-actions">{canManageChecklist && selectedRelease.status === "Preparing" ? <button className="primary-button" disabled={busy || !checks.length} title={checks.length ? "Make this release visible to the client and email their testers" : "Add at least one acceptance flow first"} onClick={() => runAction("setReleaseStatus", { releaseId: selectedRelease.id, status: "Testing" }, "Release opened for client testing")}><Send size={14} /> Open for client testing</button> : null}{canManageChecklist && selectedRelease.status === "Testing" ? <button className="quiet-button" disabled={busy} title="Tell the client a new build is ready to re-check" onClick={() => runAction("setReleaseStatus", { releaseId: selectedRelease.id, status: "Retest" }, "Client asked to retest")}><RefreshCw size={14} /> Send for retest</button> : null}{canManageChecklist && selectedRelease.status !== "Approved" ? <button className="quiet-button" onClick={() => setModal("editRelease")}><Pencil size={14} /> Edit</button> : null}<button className="quiet-button" onClick={() => setPrintReleaseId(selectedRelease.id)}><Printer size={15} /> Acceptance report</button><StatusBadge value={selectedRelease.status} /></span></div>{selectedRelease.status === "Preparing" ? <div className="draft-banner"><EyeOff size={15} /><span><b>Not visible to the client yet</b><small>Open it for testing when the acceptance flows are ready — their testers are emailed automatically.</small></span></div> : null}<p className="release-brief">{selectedRelease.testing_notes}</p><dl><div><CalendarDays size={16} /><span><dt>Testing window</dt><dd>{formatDate(selectedRelease.start_date)} – {formatDate(selectedRelease.due_date, true)}</dd></span></div><div><Inbox size={16} /><span><dt>Feedback</dt><dd>{open.length} open / {releaseTickets.length} total</dd></span></div><div><AlertTriangle size={16} /><span><dt>Blocking</dt><dd className={blockers.length ? "danger-text" : "success-text"}>{blockers.length || "Clear"}</dd></span></div></dl></article>
      <div className="release-workspace">
        <article className="surface checklist-panel"><header className="section-header"><div><p>Acceptance scope</p><h2>UAT checklist</h2></div><span className="fraction">{passedCount}/{checks.length} passed{waived.length ? ` · ${waived.length} waived` : ""}</span></header><div className="checklist-meter"><i style={{ width: `${checkPercent}%` }} /></div><div className="checklist-list">{checks.map((item) => <div key={item.id}><span className="check-title">{item.title}</span>{["Not tested", "Passed", "Failed"].map((state) => <button key={state} className={`check-chip ${item.state === state ? `on ${state === "Not tested" ? "none" : state.toLowerCase()}` : ""}`} disabled={busy || checklistLocked || !canTest} onClick={() => setCheck(item, state)}>{state}</button>)}{canWaive || item.state === "Waived" ? <button className={`check-chip ${item.state === "Waived" ? "on waived" : ""}`} disabled={busy || checklistLocked || !canWaive} onClick={() => waiveCheck(item)} title="Record this flow as descoped, with a reason">Waived</button> : null}{item.state !== "Not tested" && item.state_by ? <span className="check-attribution">{item.state} by {item.state_by}{item.state_at ? ` · ${formatDate(item.state_at, true)}` : ""}{item.state_note ? ` — ${item.state_note}` : ""}</span> : item.state === "Waived" && item.state_note ? <span className="check-attribution">{item.state_note}</span> : null}{canManageChecklist && !checklistLocked && item.state === "Not tested" ? <button className="check-remove" title="Remove this flow" aria-label={`Remove ${item.title}`} disabled={busy} onClick={() => runAction("removeChecklistItem", { itemId: item.id }, "Checklist item removed")}><Trash2 size={13} /></button> : null}</div>)}{!checks.length ? <div className="member-empty"><FileText size={18} /><span><b>No acceptance flows yet</b><small>{canManageChecklist ? "Add the flows the client should test below, or generate them from the scope when creating the next release." : "The delivery team has not added acceptance flows yet."}</small></span></div> : null}</div>{canManageChecklist && !checklistLocked ? <form className="check-add" onSubmit={addCheckItem}><input value={newCheck} maxLength={180} onChange={(event) => setNewCheck(event.target.value)} placeholder="Add an acceptance flow, e.g. Guest checkout with a saved card" /><button className="secondary-button" disabled={busy || !newCheck.trim()}>Add flow</button></form> : null}</article>
        <article className="surface approval-panel"><header className="section-header"><div><p>Delivery gate</p><h2>{selectedRelease.status === "Approved" ? "Release accepted" : "Client sign-off"}</h2></div><ShieldCheck size={18} /></header>{selectedRelease.status === "Approved" ? <div className="approved-state"><CheckCircle2 size={28} /><h3>Accepted by {selectedRelease.approved_by}</h3><p>{formatDate(selectedRelease.approved_at || "", true)}</p>{approval?.exceptions && approval.exceptions !== "No exceptions" ? <span className="approved-exceptions"><b>Recorded exceptions</b>{approval.exceptions}</span> : null}{approval?.on_behalf_of ? <span className="approved-exceptions"><b>Accepted on behalf of</b>{approval.on_behalf_of}</span> : null}<small>Recorded as append-only acceptance evidence.</small></div> : <><div className="gate-list"><GateRow passed={!blockers.length} title="No open blockers" detail={blockers.length ? `${blockers.length} high-impact items remain` : "Requirement met"} /><GateRow passed={!incomplete.length} title="Checklist complete" detail={incomplete.length ? `${incomplete.length} checks are not passed` : waived.length ? `Requirement met (${waived.length} waived)` : "Requirement met"} /><GateRow passed={canSign} title="Authorised approver" detail={canSign ? roleLabel(actor.role) : "Client admin approval required"} /></div>{open.length ? (
          <div className="carry-panel">
            <p className="carry-head"><b>Open items at sign-off</b><small>{open.length} item{open.length === 1 ? "" : "s"} will be recorded on the acceptance report as open when this release is accepted.</small></p>
            <ul className="carry-list">
              {open.map((ticket) => <li key={ticket.id}>
                {canCarry ? <input type="checkbox" checked={carrySelection.includes(ticket.id)} disabled={busy} onChange={() => toggleCarry(ticket.id)} aria-label={`Select ${ticket.key} to carry forward`} /> : null}
                <span className="carry-key">{ticket.key}</span>
                <span className="carry-title">{ticket.title}</span>
                <SeverityBadge value={ticket.severity} />
              </li>)}
            </ul>
            {canCarry ? (
              <div className="carry-actions">
                <label className="carry-target"><span>Carry into</span>
                  <select value={carryTarget} onChange={(event) => setCarryTarget(event.target.value)} disabled={!carryTargets.length}>
                    <option value="">{carryTargets.length ? "Choose a release" : "No other open release"}</option>
                    {carryTargets.map((row) => <option key={row.id} value={row.id}>{row.version} — {row.name}</option>)}
                  </select>
                </label>
                <button className="secondary-button" disabled={busy || !carrySelection.length || !carryTarget} onClick={() => settleOpenItems("move")}>Carry forward</button>
                <button className="quiet-button" disabled={busy || !carrySelection.length} onClick={() => settleOpenItems("defer")} title="Record these as agreed not to fix, leaving them on this release">Defer by agreement</button>
              </div>
            ) : (
              <label className="carry-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I accept this release with the items above still open.</span></label>
            )}
          </div>
        ) : null}<button className="primary-button full" disabled={!canApprove || !canSign || busy || (needsAcknowledgement && !acknowledged)} onClick={() => setConfirmApproval(true)}>{canApprove && canSign ? "Approve release" : "Complete the gates above"}</button><p className="approval-note">Approval captures the release build, approver, timestamp, the scope revision in force and any recorded exceptions.</p></>}</article>
      </div>
      {canManageChecklist ? <article className="surface announcement-composer">
        <header className="section-header"><div><p>Client communication</p><h2>Post an announcement</h2></div><Megaphone size={18} /></header>
        <p className="announcement-hint">Goes to this client&rsquo;s workspace home and emails everyone on their side who has not opted out. Opening a release for testing already posts its own notice.</p>
        <form onSubmit={postAnnouncement}>
          <input value={announceTitle} maxLength={140} onChange={(event) => setAnnounceTitle(event.target.value)} placeholder="What has changed, in one line" />
          <textarea value={announceBody} maxLength={3000} rows={3} onChange={(event) => setAnnounceBody(event.target.value)} placeholder="Optional detail — what the client should do, and by when" />
          <div className="announcement-composer-actions">
            <small>{announceTitle.length}/140</small>
            <button className="secondary-button" disabled={busy || !announceTitle.trim()}><Send size={14} /> Post announcement</button>
          </div>
        </form>
        {projectAnnouncements.length ? <ol className="announcement-posted">
          {projectAnnouncements.slice(0, 6).map((announcement) => {
            // System notices are lifecycle evidence; the server refuses to
            // delete them, so the control is not offered either.
            const removable = announcement.kind === "announcement" && (actor.role === "agency_admin" || announcement.author === actor.name);
            return <li key={announcement.id}>
              <span>
                <p className="announcement-kind">{announcementKindLabel(announcement.kind)} · {announcement.author} · {formatDate(announcement.created_at, true)}</p>
                <b>{announcement.title}</b>
              </span>
              {removable ? <button className="check-remove" title="Withdraw this announcement" aria-label={`Withdraw ${announcement.title}`} disabled={busy} onClick={() => runAction("deleteAnnouncement", { announcementId: announcement.id }, "Announcement withdrawn")}><Trash2 size={13} /></button> : null}
            </li>;
          })}
        </ol> : null}
      </article> : null}
      {isClientView ? <div className="client-help"><ShieldCheck size={17} /><span><b>You are reviewing your organisation’s release.</b><small>Internal delivery notes and other client workspaces are hidden.</small></span></div> : null}
    </section>
    {confirmApproval ? (
      <ApprovalConfirm release={selectedRelease} project={project} scopeVersion={currentScope} checks={checks} openItems={open} releaseTickets={releaseTickets} actor={actor} close={() => setConfirmApproval(false)} runAction={runAction} busy={busy} />
    ) : null}
  </div>;
}

/**
 * Everything the approver is agreeing to, restated before they agree to it.
 *
 * Withdrawing a single ticket already prompts a window.confirm, while accepting
 * an entire release — the commercial act this whole product exists to record —
 * was one unguarded click on a button that had been sitting on screen the whole
 * time. Typing the version is the deliberate friction; the prefilled exceptions
 * are so the recorded caveats reflect the feedback that is actually deferred,
 * rejected or open rather than an empty box nobody fills in.
 */
function ApprovalConfirm({ release, project, scopeVersion, checks, openItems, releaseTickets, actor, close, runAction, busy }: { release: Release; project?: Project; scopeVersion?: ScopeVersion; checks: ChecklistItem[]; openItems: Ticket[]; releaseTickets: Ticket[]; actor: Actor; close: () => void; runAction: RunAction; busy: boolean }) {
  const [exceptions, setExceptions] = useState(() => exceptionDraft(releaseTickets));
  const [onBehalfOf, setOnBehalfOf] = useState("");
  const [typed, setTyped] = useState("");
  const passed = checks.filter((item) => item.state === "Passed").length;
  const waived = checks.filter((item) => item.state === "Waived").length;
  // A staff sign-off and a client sign-off are different commercial facts, and
  // the server rejects the former without a named principal.
  const needsOnBehalf = actor.isStaff;
  const ready = typed.trim() === release.version && (!needsOnBehalf || onBehalfOf.trim().length > 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    const payload: ActionPayload = { releaseId: release.id, exceptions: exceptions.trim(), acknowledgeOpen: "1" };
    if (onBehalfOf.trim()) payload.onBehalfOf = onBehalfOf.trim();
    const ok = await runAction("approveRelease", payload, "Release approved and recorded");
    if (ok) close();
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label="Confirm release acceptance">
      <header>
        <div><p>Client sign-off</p><h2>Accept {release.version}?</h2></div>
        <button onClick={close} aria-label="Close"><X size={17} /></button>
      </header>
      <form onSubmit={submit}>
        <dl className="span-2 approve-facts">
          <div><dt>Release</dt><dd>{release.name}</dd></div>
          <div><dt>Version and build</dt><dd>{release.version} · {release.build}</dd></div>
          <div><dt>Project</dt><dd>{project?.name || "—"}</dd></div>
          <div><dt>Scope of work</dt><dd>{scopeVersion ? `v${scopeVersion.version}, recorded ${formatDate(scopeVersion.created_at, true)}` : "None recorded"}</dd></div>
          <div><dt>Acceptance checklist</dt><dd>{passed} of {checks.length} passed{waived ? ` · ${waived} waived` : ""}</dd></div>
          <div><dt>Open items</dt><dd>{openItems.length || "None"}</dd></div>
        </dl>
        {openItems.length ? (
          <div className="span-2 approve-open">
            <p><b>These items are open and will be recorded as open on the acceptance report</b></p>
            <ul>{openItems.map((ticket) => <li key={ticket.id}><span>{ticket.key}</span><span>{ticket.title}</span><SeverityBadge value={ticket.severity} /></li>)}</ul>
          </div>
        ) : null}
        <label className="span-2">Exceptions to record
          <textarea value={exceptions} maxLength={1000} rows={5} onChange={(event) => setExceptions(event.target.value)} placeholder="Agreed items that ship despite being open, e.g. deferred content fixes" />
        </label>
        {needsOnBehalf ? (
          <label className="span-2">Accepted on behalf of (required for an internal approver)
            <input value={onBehalfOf} maxLength={200} onChange={(event) => setOnBehalfOf(event.target.value)} placeholder="e.g. Maya Chen, Northstar Retail — confirmed by email 22 Jul" />
          </label>
        ) : null}
        <label className="span-2">Type <b>{release.version}</b> to confirm
          <input value={typed} maxLength={40} autoComplete="off" onChange={(event) => setTyped(event.target.value)} placeholder={release.version} />
        </label>
        <p className="span-2 approval-note">Acceptance is final and cannot be undone. The release, its checklist and its open items are frozen as evidence.</p>
        <footer>
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button type="submit" className="primary-button" disabled={!ready || busy}>Approve release</button>
        </footer>
      </form>
    </section>
  </div>;
}

/**
 * Seeds the exceptions box from what is genuinely unresolved, so the recorded
 * caveats match the feedback list instead of depending on the approver's memory.
 */
function exceptionDraft(tickets: Ticket[]) {
  const lines: string[] = [];
  for (const ticket of tickets.filter((ticket) => ticket.status === "Deferred")) lines.push(`Deferred by agreement: ${ticket.key} — ${ticket.title}`);
  for (const ticket of tickets.filter((ticket) => ticket.status === "Rejected / out of scope")) lines.push(`Assessed as out of scope: ${ticket.key} — ${ticket.title}`);
  for (const ticket of tickets.filter((ticket) => !closedStatuses.has(ticket.status))) lines.push(`Open at acceptance (${ticket.severity}): ${ticket.key} — ${ticket.title}`);
  // The server caps `exceptions` at 1000 characters and rejects anything longer.
  return lines.join("\n").slice(0, 1000);
}

/**
 * The acceptance evidence document.
 *
 * Everything here is either frozen at sign-off (the approval row's snapshots) or
 * derived from the scope revision that was current at sign-off. Live tables are
 * used only for the release's own feedback list, because a carried-forward
 * ticket legitimately leaves this release and is reinstated on the report from
 * the `open_items` snapshot instead.
 */
function AcceptanceReport({ release, project, client, checklist, tickets, approval, scope, members, actor, close }: { release: Release; project?: Project; client?: Client; checklist: ChecklistItem[]; tickets: Ticket[]; approval?: ReleaseApproval; scope: ScopeVersion[]; members: Member[]; actor: Actor; close: () => void }) {
  const [docHash, setDocHash] = useState("");
  // Read once, on mount: the stamp must not move when the digest resolves and
  // re-renders the sheet, and the wall clock is not a value to read every render.
  const [generatedAt] = useState(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())} (${zone})`;
  });

  // The revision the client actually signed against — the newest one recorded at
  // or before sign-off, not whatever the scope has drifted to since. Timestamps
  // are both SQLite CURRENT_TIMESTAMP strings, so a lexical compare is a
  // chronological compare.
  const ordered = [...scope].sort((a, b) => a.version - b.version);
  const acceptedAt = approval?.approved_at || release.approved_at || "";
  const eligible = acceptedAt ? ordered.filter((version) => version.created_at <= acceptedAt) : ordered;
  const scopePool = eligible.length ? eligible : ordered;
  const scopeVersion = scopePool.length ? scopePool[scopePool.length - 1] : undefined;

  // Prefer the frozen snapshot: the live rows are locked once approved, but the
  // snapshot is what was actually shown to the person who signed.
  const snapshotChecks = parseJsonRows<ChecklistSnapshotRow>(approval?.checklist_snapshot);
  const checklistRows: ChecklistSnapshotRow[] = snapshotChecks.length ? snapshotChecks : checklist.map((item) => ({
    id: item.id, title: item.title, state: item.state,
    state_by: item.state_by || "", state_at: item.state_at || null, state_note: item.state_note || "",
  }));
  const waivedRows = checklistRows.filter((row) => row.state === "Waived");
  const openSnapshot = parseJsonRows<ApprovalOpenItem>(approval?.open_items);

  // Carry-forward re-points a ticket at the next release, so it is no longer in
  // `tickets` — it is added back here from the snapshot so the outcome table and
  // the open-items section still account for it.
  const liveKeys = new Set(tickets.map((ticket) => ticket.key));
  const carriedAway = openSnapshot.filter((item) => !liveKeys.has(item.key));
  const outcomeStatuses = [...tickets.map((ticket) => ticket.status), ...carriedAway.map((item) => item.status)];
  const countWhere = (predicate: (status: string) => boolean) => outcomeStatuses.filter(predicate).length;
  // "N of M resolved" counted Withdrawn, Deferred and Rejected as resolved, which
  // tells a stakeholder that work was done when it was not. These five buckets
  // partition the same set and each one names what actually happened.
  const outcomes = [
    { label: "Fixed and confirmed", detail: "Verified by the client, or closed by the delivery team", count: countWhere((status) => status === "Verified" || status === "Closed") },
    { label: "Withdrawn by the client", detail: "Raised and then retracted by the client", count: countWhere((status) => status === "Withdrawn") },
    { label: "Deferred by agreement", detail: "Agreed not to fix as part of this release", count: countWhere((status) => status === "Deferred") },
    { label: "Assessed as out of scope", detail: "Judged to fall outside the agreed scope of work", count: countWhere((status) => status === "Rejected / out of scope") },
    { label: "Open at time of acceptance", detail: "Still outstanding when the release was accepted", count: countWhere((status) => !closedStatuses.has(status)) },
  ];

  const approverName = approval?.approved_by || release.approved_by || "";
  const approverRole = approval?.approved_by_role ? roleLabel(approval.approved_by_role) : "";
  const approverMember = members.find((member) => member.name === approverName);
  const leadMember = members.find((member) => member.name === project?.manager);
  const documentDate = (acceptedAt || todayIso()).slice(0, 10);

  // A canonical rendering of every piece of evidence the document asserts. Same
  // evidence in, same reference out — a reprint months later is verifiable
  // against the copy the client holds, and any silent edit changes the hash.
  const canonical = [
    release.id,
    release.version,
    release.build,
    scopeVersion?.id || "",
    ...checklistRows.map((row) => `${row.id}:${row.state}`).sort(),
    ...[...tickets.map((ticket) => `${ticket.key}:${ticket.status}`), ...carriedAway.map((item) => `${item.key}:${item.status}`)].sort(),
    approverName,
    acceptedAt,
  ].join("\n");

  useEffect(() => {
    let cancelled = false;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)).then((digest) => {
      if (cancelled) return;
      setDocHash([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [canonical]);

  return <div className="print-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="print-sheet" role="dialog" aria-modal="true" aria-label="Acceptance report">
      <header className="print-toolbar no-print">
        <p>Preview of the acceptance evidence document</p>
        <span><button className="secondary-button" onClick={close}><X size={15} /> Close</button><button className="primary-button" onClick={() => window.print()}><Printer size={15} /> Print or save PDF</button></span>
      </header>
      <div className="print-body">
        <header className="print-head">
          <div><p>UAT acceptance report</p><h1>{project?.name}</h1><small>{client?.name} · {release.status === "Approved" ? "Accepted" : "Draft — not yet accepted"}</small></div>
          <span className="print-brand">DeliveryLoop</span>
        </header>
        {docHash ? (
          <div className="print-doc-id">
            <span><b>Document reference</b>DL-{project?.code || "DL"}-{release.version}-{documentDate}-{docHash}</span>
            <span><b>Generated</b>{generatedAt || "—"} by {actor.name} ({roleLabel(actor.role)})</span>
          </div>
        ) : null}
        <dl className="print-facts">
          <div><dt>Release</dt><dd>{release.name}</dd></div>
          <div><dt>Version / build</dt><dd>{release.version} · {release.build}</dd></div>
          <div><dt>Testing window</dt><dd>{formatDate(release.start_date, true)} – {formatDate(release.due_date, true)}</dd></div>
          <div><dt>Status</dt><dd>{release.status}{approverName ? ` by ${approverName} on ${formatDate(acceptedAt, true)}` : ""}</dd></div>
          {approval ? <div className="span-2"><dt>Recorded exceptions</dt><dd>{approval.exceptions || "No exceptions"}</dd></div> : null}
        </dl>

        <h2>Scope of work accepted against</h2>
        {scopeVersion ? (
          <>
            <p className="print-summary">
              {release.status === "Approved" ? "Accepted" : "Prepared"} against <b>Scope of work v{scopeVersion.version}</b>, recorded {formatDate(scopeVersion.created_at, true)} by {scopeVersion.author}{scopeVersion.author_role ? ` (${roleLabel(scopeVersion.author_role).toLowerCase()})` : ""}.
            </p>
            <p className="print-summary">Change recorded with that revision: {scopeVersion.change_note || "Initial agreed scope"}. The full text is reproduced in the appendix below.</p>
          </>
        ) : <p className="print-summary">No scope of work has been recorded for this project, so this release was accepted without a written scope reference.</p>}

        <h2>Acceptance checklist</h2>
        <table><thead><tr><th>Acceptance flow</th><th>Result</th><th>Recorded</th><th>Note</th></tr></thead><tbody>
          {checklistRows.map((row) => <tr key={row.id}>
            <td>{row.state === "Waived" ? <>{row.title} <sup>*</sup></> : row.title}</td>
            <td className={row.state === "Passed" ? "pass" : row.state === "Failed" ? "fail" : ""}>{row.state}</td>
            <td>{row.state_by ? <>{row.state_by}{row.state_at ? <><br /><small>{formatStamp(row.state_at)}</small></> : null}</> : "Not recorded"}</td>
            <td>{row.state_note || "—"}</td>
          </tr>)}
          {!checklistRows.length ? <tr><td colSpan={4}>No checklist items were defined.</td></tr> : null}
        </tbody></table>
        {waivedRows.length ? <p className="print-note">* Waived items were agreed as out of scope for this release and were not tested.</p> : null}

        <h2>Feedback outcomes</h2>
        <table><thead><tr><th>Outcome</th><th>What it means</th><th>Items</th></tr></thead><tbody>
          {outcomes.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.detail}</td><td>{row.count}</td></tr>)}
          <tr><td><b>Total reported</b></td><td>Every item raised against this release</td><td><b>{outcomeStatuses.length}</b></td></tr>
        </tbody></table>

        <h2>Open items at acceptance</h2>
        {approval ? (
          openSnapshot.length ? <>
            <table><thead><tr><th>Key</th><th>Title</th><th>Severity</th><th>Status at acceptance</th></tr></thead><tbody>
              {openSnapshot.map((item) => <tr key={item.key}><td>{item.key}</td><td>{item.title}</td><td>{item.severity}</td><td>{item.status}</td></tr>)}
            </tbody></table>
            <p className="print-note">Recorded from the sign-off snapshot. Items later carried into a subsequent release remain listed here, because they were open when this release was accepted.</p>
          </> : <p className="print-summary">Nothing was left open when this release was accepted.</p>
        ) : <p className="print-summary">This release has not been accepted yet, so no open-item snapshot exists. {tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length} item(s) are currently open.</p>}

        <h2>Feedback summary</h2>
        <table><thead><tr><th>Key</th><th>Title</th><th>Type</th><th>Severity</th><th>Status</th></tr></thead><tbody>
          {tickets.map((ticket) => <tr key={ticket.id}><td>{ticket.key}</td><td>{ticket.title}</td><td>{ticket.type}</td><td>{ticket.severity}</td><td>{ticket.status}</td></tr>)}
          {!tickets.length ? <tr><td colSpan={5}>No feedback is currently recorded against this release.</td></tr> : null}
        </tbody></table>

        <h2>Signatures</h2>
        <div className="print-signatures">
          <div>
            <p>Client acceptance</p>
            <dl>
              <div><dt>Accepted by</dt><dd>{approverName || "Not yet accepted"}</dd></div>
              <div><dt>Role</dt><dd>{approverRole || "—"}{approverMember ? ` · ${approverMember.email}` : ""}</dd></div>
              <div><dt>Date and time</dt><dd>{acceptedAt ? formatStamp(acceptedAt) : "—"}</dd></div>
              {approval?.on_behalf_of ? <div><dt>On behalf of</dt><dd>{approval.on_behalf_of}</dd></div> : null}
              <div><dt>Recorded exceptions</dt><dd>{approval?.exceptions || "No exceptions"}</dd></div>
            </dl>
            <span className="print-rule" />
            <small>Signature</small>
          </div>
          <div>
            <p>Agency confirmation</p>
            <dl>
              <div><dt>Project lead</dt><dd>{project?.manager || "—"}{leadMember ? ` · ${leadMember.email}` : ""}</dd></div>
              <div><dt>Delivered build</dt><dd>{approval?.build || release.build}</dd></div>
              <div><dt>Release version</dt><dd>{approval?.version || release.version}</dd></div>
            </dl>
            <span className="print-rule" />
            <small>Signature and date</small>
          </div>
        </div>

        {scopeVersion ? <>
          <h2>Appendix — Scope of work v{scopeVersion.version}</h2>
          <pre className="print-scope-body">{scopeVersion.body}</pre>
        </> : null}

        <footer className="print-footer">Generated by DeliveryLoop. The document reference above is a SHA-256 digest of this release, its scope revision, its checklist results, its feedback outcomes and its approver — the same evidence always produces the same reference. Approval events are additionally recorded with the approver identity and timestamp in the append-only audit log.</footer>
      </div>
    </section>
  </div>;
}

function GateRow({ passed, title, detail }: { passed: boolean; title: string; detail: string }) {
  return <div><span className={passed ? "pass" : "block"}>{passed ? <Check size={13} /> : <AlertCircle size={13} />}</span><p><b>{title}</b><small>{detail}</small></p></div>;
}

function Feedback({ data, tickets, query, setQuery, statusFilter, setStatusFilter, setSelectedTicketId, boardMode, setBoardMode, myWork, setMyWork, unreadIds, visibleCount, setVisibleCount, isStaff, isClientView, runAction }: { data: Workspace; tickets: Ticket[]; query: string; setQuery: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; setSelectedTicketId: (id: string) => void; boardMode: boolean; setBoardMode: (value: boolean) => void; myWork: boolean; setMyWork: (value: boolean) => void; unreadIds: Set<string>; visibleCount: number; setVisibleCount: (value: number) => void; isStaff: boolean; isClientView: boolean; runAction: RunAction }) {
  const paged = tickets.slice(0, visibleCount);
  // Clients pick from the five things that can be true of their feedback, not
  // from the delivery team's twelve-state workflow.
  const filterOptions = isClientView ? clientStatusGroups.map((group) => group.label) : statusOptions;
  return <div className="page-content feedback-page">
    <div className="filter-row">
      <label className="search-box"><Search size={16} /><input aria-label="Search feedback" placeholder="Search feedback, project or reporter  ( / )" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="filter-select"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{filterOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button className={`mywork-toggle ${myWork ? "active" : ""}`} onClick={() => setMyWork(!myWork)} aria-pressed={myWork}><UserCheck size={14} /> {isClientView ? "My reports" : "My work"}</button>
      {/* The board mirrors the delivery team's columns, which are their process
          and not the client's — a client only needs the list. */}
      {isClientView ? null : <div className="view-toggle" role="group" aria-label="Layout">
        <button className={boardMode ? "" : "active"} onClick={() => setBoardMode(false)}>List</button>
        <button className={boardMode ? "active" : ""} onClick={() => setBoardMode(true)}>Board</button>
      </div>}
      <span className="result-count">{tickets.length} results</span>
    </div>
    {isClientView ? <div className="client-help"><Inbox size={17} /><span><b>Everything your team has reported.</b><small>Items marked &ldquo;Ready to retest&rdquo; are waiting on you.</small></span></div> : null}
    {boardMode && !isClientView ? (
      <FeedbackBoard tickets={tickets} onOpen={setSelectedTicketId} isStaff={isStaff} unreadIds={unreadIds} runAction={runAction} />
    ) : (
      <article className="surface feedback-surface">
        <FeedbackTable tickets={paged} projects={data.projects} onOpen={setSelectedTicketId} unreadIds={unreadIds} client={isClientView} />
        {tickets.length > visibleCount ? <div className="load-more"><button className="secondary-button" onClick={() => setVisibleCount(visibleCount + 50)}>Show {Math.min(50, tickets.length - visibleCount)} more of {tickets.length - visibleCount}</button></div> : null}
      </article>
    )}
  </div>;
}

function FeedbackBoard({ tickets, onOpen, isStaff, unreadIds, runAction }: { tickets: Ticket[]; onOpen: (id: string) => void; isStaff: boolean; unreadIds?: Set<string>; runAction: RunAction }) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  function handleDrop(columnId: string, event: React.DragEvent) {
    event.preventDefault();
    setDragOver(null);
    if (!isStaff) return;
    const ticketId = event.dataTransfer.getData("text/deliveryloop-ticket");
    const ticket = tickets.find((item) => item.id === ticketId);
    const column = boardColumns.find((item) => item.id === columnId);
    if (!ticket || !column || column.statuses.includes(ticket.status)) return;
    void runAction("updateTicket", { ticketId: ticket.id, field: "status", value: column.dropStatus }, `${ticket.key} moved to ${column.dropStatus}`, (workspace) => ({
      ...workspace,
      tickets: workspace.tickets.map((entry) => entry.id === ticket.id ? { ...entry, status: column.dropStatus } : entry),
    }));
  }
  return <div className="feedback-board">
    {boardColumns.map((column) => {
      const columnTickets = tickets.filter((ticket) => column.statuses.includes(ticket.status));
      return <section key={column.id} className={`board-column ${dragOver === column.id ? "drag-over" : ""}`}
        onDragOver={(event) => { if (isStaff) { event.preventDefault(); setDragOver(column.id); } }}
        onDragLeave={() => setDragOver((current) => current === column.id ? null : current)}
        onDrop={(event) => handleDrop(column.id, event)}>
        <header><span><i className={`col-dot ${column.id}`} />{column.label}</span><em>{columnTickets.length}</em></header>
        <div className="board-cards">
          {columnTickets.map((ticket) => {
            const chip = slaChip(ticket);
            return <button key={ticket.id} className="board-card" draggable={isStaff}
              onDragStart={(event) => event.dataTransfer.setData("text/deliveryloop-ticket", ticket.id)}
              onClick={() => onOpen(ticket.id)}>
              <span className="board-card-top"><small>{ticket.key}</small>{unreadIds?.has(ticket.id) ? <i className="unread-dot" title="New activity" /> : null}<em className={`severity-flag ${ticket.severity.toLowerCase()}`} title={`${ticket.severity} severity`}>{ticket.severity}</em></span>
              <b>{ticket.title}</b>
              <span className="board-card-meta"><TypeBadge value={ticket.type} />{chip ? <SlaChip chip={chip} /> : null}<span className={`board-assignee ${ticket.assignee === "Unassigned" ? "empty" : ""}`} style={ticket.assignee === "Unassigned" ? undefined : avatarStyle(ticket.assignee)} title={ticket.assignee === "Unassigned" ? "Unassigned — open the card to assign" : `Assigned to ${ticket.assignee}`}>{ticket.assignee === "Unassigned" ? "?" : initials(ticket.assignee)}</span></span>
            </button>;
          })}
          {!columnTickets.length ? <div className="board-empty">Nothing here</div> : null}
        </div>
      </section>;
    })}
  </div>;
}

function SlaChip({ chip }: { chip: { tone: "client" | "team"; label: string } }) {
  return <span className={`sla-chip ${chip.tone}`}><Clock3 size={11} />{chip.label}</span>;
}

function FeedbackTable({ tickets, projects, onOpen, unreadIds, compact = false, client = false }: { tickets: Ticket[]; projects: Project[]; onOpen: (id: string) => void; unreadIds?: Set<string>; compact?: boolean; client?: boolean }) {
  return <div className={`feedback-table ${compact ? "compact" : ""}`}><div className="feedback-head"><span>Feedback</span><span>Project</span><span>Status</span><span>Severity</span><span>Reporter</span><span className="updated-cell">Updated</span></div>{tickets.length ? tickets.map((ticket) => {
    const project = projects.find((item) => item.id === ticket.project_id);
    const chip = compact ? null : slaChip(ticket);
    return <button className="feedback-row" key={ticket.id} onClick={() => onOpen(ticket.id)}>
      <span className="feedback-title">{unreadIds?.has(ticket.id) ? <i className="unread-dot" title="New activity" /> : null}<span className="row-key">{ticket.key}</span><b>{ticket.title}</b><TypeBadge value={ticket.type} /></span>
      <span className="project-reference">{project?.code}</span>
      <span className="status-cell"><StatusBadge value={ticket.status} client={client} />{chip ? <SlaChip chip={chip} /> : null}</span>
      <span><em className={`severity-flag ${ticket.severity.toLowerCase()}`}>{ticket.severity}</em></span>
      <span className="owner-cell"><i style={avatarStyle(ticket.reporter)}>{initials(ticket.reporter)}</i><span>{ticket.reporter}</span></span>
      <span className="updated-cell">{relTime(ticket.updated_at || ticket.created_at)}</span>
    </button>;
  }) : <EmptyState icon={Inbox} title="No feedback in this view" body="Change the filters or report a new issue." />}</div>;
}

function Clients({ data, actor, openMemberModal, runAction, busy, notify }: { data: Workspace; actor: Actor; openMemberModal: (clientId: string) => void; runAction: (action: string, payload: ActionPayload, success: string) => Promise<boolean>; busy: boolean; notify: (message: string) => void }) {
  return <div className="page-content client-page">
    <div className="access-intro surface"><div><ShieldCheck size={19} /><span><p>Tenant-aware access</p><h2>Every client is isolated to its own releases, feedback and public conversations.</h2></span></div><small>Access is matched to the exact verified email invited here.</small></div>
    <div className="client-list">{data.clients.map((client) => {
      const projects = data.projects.filter((project) => project.client_id === client.id);
      const members = data.members.filter((member) => member.client_id === client.id);
      const tickets = data.tickets.filter((ticket) => projects.some((project) => project.id === ticket.project_id));
      return <article className="surface client-access-card" key={client.id}>
        <header><span style={{ background: client.accent }}>{initials(client.name)}</span><div><h2>{client.name}</h2><p>{client.contact_name} · {client.contact_email}</p></div>{["agency_admin", "client_admin"].includes(actor.role) ? <button className="secondary-button" onClick={() => openMemberModal(client.id)}><UserPlus size={15} /> Invite member</button> : null}</header>
        <div className="client-stats"><div><span>Projects</span><b>{projects.length}</b></div><div><span>Open feedback</span><b>{tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length}</b></div><div><span>Active members</span><b>{members.filter((member) => member.active === "1").length}</b></div></div>
        <MemberDirectory members={members} actor={actor} runAction={runAction} busy={busy} notify={notify} />
      </article>;
    })}</div>
  </div>;
}

function Settings({ data, actor, openMemberModal, runAction, busy, notify }: { data: Workspace; actor: Actor; openMemberModal: (clientId: string) => void; runAction: (action: string, payload: ActionPayload, success: string) => Promise<boolean>; busy: boolean; notify: (message: string) => void }) {
  const staff = data.members.filter((member) => !member.client_id && ["agency_admin", "project_manager", "developer"].includes(member.role));
  const activeClientMembers = data.members.filter((member) => member.client_id && member.active === "1").length;
  const clientAdmins = new Set(data.members.filter((member) => member.role === "client_admin" && member.active === "1").map((member) => member.client_id));
  return <div className="page-content settings-page">
    <section className="security-grid">
      <article className="surface security-card"><ShieldCheck size={19} /><div><p>Authentication</p><h2>Email, password and verification</h2><small>Secure HTTP-only sessions, verified email ownership and invitation-only registration protect every account.</small></div><span className="security-state"><i /> Enforced</span></article>
      <article className="surface security-card"><LockKeyhole size={19} /><div><p>Authorisation</p><h2>Role and tenant controls</h2><small>Every server request checks the member role and client workspace before reading or changing data.</small></div><span className="security-state"><i /> Enforced</span></article>
      <article className="surface security-card"><Activity size={19} /><div><p>Protection</p><h2>Rate limits and audit trail</h2><small>Write actions are throttled and sensitive changes are attributed to the signed-in member.</small></div><span className="security-state"><i /> Active</span></article>
    </section>
    <AccountSecurity notify={notify} />
    <section className="settings-grid">
      <article className="surface internal-team"><header className="section-header"><div><p>Agency workspace</p><h2>Internal delivery team</h2></div>{actor.role === "agency_admin" ? <button className="secondary-button" onClick={() => openMemberModal("agency")}><UserPlus size={15} /> Add teammate</button> : null}</header><MemberDirectory members={staff} actor={actor} runAction={runAction} busy={busy} notify={notify} /></article>
      <aside className="surface readiness-card"><header><p>Access readiness</p><h2>Client onboarding</h2></header><div className="readiness-number">{activeClientMembers}<span>active client members</span></div><div className="readiness-list"><div><CheckCircle2 size={15} /><span><b>Owner identity secured</b><small>{actor.email}</small></span></div><div><CheckCircle2 size={15} /><span><b>{data.clients.length} client workspaces isolated</b><small>API and attachment access checked server-side</small></span></div><div className={clientAdmins.size === data.clients.length ? "" : "pending"}><AlertCircle size={15} /><span><b>{clientAdmins.size} of {data.clients.length} clients have an admin</b><small>Add one client admin before handing over each portal.</small></span></div></div></aside>
    </section>
    <TemplatePanel templates={data.templates || []} runAction={runAction} busy={busy} />
    <ChecklistTemplatePanel templates={data.checklistTemplates || []} runAction={runAction} busy={busy} />
  </div>;
}

function ChecklistTemplatePanel({ templates, runAction, busy }: { templates: ChecklistTemplate[]; runAction: (action: string, payload: ActionPayload, success: string) => Promise<boolean>; busy: boolean }) {
  return <article className="surface template-panel">
    <header className="section-header"><div><p>Reusable UAT</p><h2>Checklist templates</h2></div></header>
    <p className="template-hint">Save any acceptance checklist as a template from the “Prepare release” screen — then insert it into future releases in one click.</p>
    <div className="template-list">
      {templates.map((template) => {
        const flows = template.items.split("\n").filter(Boolean);
        return <div key={template.id} className="template-row"><div><b>{template.title}</b><small>{flows.length} flow{flows.length === 1 ? "" : "s"} · {flows.slice(0, 3).join(" · ")}{flows.length > 3 ? " …" : ""}</small></div><button aria-label={`Delete checklist template ${template.title}`} title="Delete template" disabled={busy} onClick={() => runAction("deleteChecklistTemplate", { templateId: template.id }, "Checklist template removed")}><Trash2 size={14} /></button></div>;
      })}
      {!templates.length ? <div className="member-empty"><PackageCheck size={18} /><span><b>No checklist templates yet</b><small>Build a checklist once on a release, save it as a template, reuse it everywhere.</small></span></div> : null}
    </div>
  </article>;
}

function TemplatePanel({ templates, runAction, busy }: { templates: ReplyTemplate[]; runAction: (action: string, payload: ActionPayload, success: string) => Promise<boolean>; busy: boolean }) {
  const [adding, setAdding] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction("createReplyTemplate", { title: field(form, "title"), body: field(form, "body") }, "Reply template saved");
    setAdding(false);
  }
  return <article className="surface template-panel">
    <header className="section-header"><div><p>Consistent replies</p><h2>Saved reply templates</h2></div>{adding ? null : <button className="secondary-button" onClick={() => setAdding(true)}><Plus size={15} /> New template</button>}</header>
    <p className="template-hint">Templates appear in the “Insert saved reply” menu on every feedback conversation, so triage answers stay fast and consistent.</p>
    {adding ? <form className="template-form" onSubmit={submit}>
      <input name="title" required maxLength={80} placeholder="Template name, e.g. Ask for reproduction steps" />
      <textarea name="body" required maxLength={2000} placeholder="Thanks for the report! Could you share the exact steps you took before this happened, starting from sign-in?" />
      <footer><button type="button" className="quiet-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save template"}</button></footer>
    </form> : null}
    <div className="template-list">
      {templates.map((template) => <div key={template.id} className="template-row"><div><b>{template.title}</b><small>{template.body.length > 140 ? `${template.body.slice(0, 140)}…` : template.body}</small></div><button aria-label={`Delete template ${template.title}`} title="Delete template" disabled={busy} onClick={() => runAction("deleteReplyTemplate", { templateId: template.id }, "Template removed")}><Trash2 size={14} /></button></div>)}
      {!templates.length && !adding ? <div className="member-empty"><FileText size={18} /><span><b>No templates yet</b><small>Save your first canned reply for faster triage.</small></span></div> : null}
    </div>
  </article>;
}

function AccountSecurity({ notify }: { notify: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React nulls `currentTarget` once the handler yields, so this must be
    // captured before the await — reading it afterwards threw a TypeError on
    // every SUCCESSFUL change and left the form sitting open, as if it failed.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = field(form, "currentPassword");
    const newPassword = field(form, "newPassword");
    const confirmPassword = field(form, "confirmPassword");
    if (newPassword !== confirmPassword) return notify("New passwords do not match");
    setSaving(true);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setSaving(false);
    if (result.error) return notify(result.error.message || "Password could not be changed");
    formElement.reset();
    setOpen(false);
    notify("Password changed and other sessions signed out");
  }
  return <section className="surface account-security-panel"><div><KeyRoundIcon /><span><p>Your account</p><h2>Password and active sessions</h2><small>Changing your password signs out every other browser and device.</small></span></div>{open ? <form onSubmit={changePassword}><input name="currentPassword" type="password" autoComplete="current-password" required placeholder="Current password" /><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required placeholder="New password (12+ characters)" /><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required placeholder="Confirm new password" /><button type="button" className="quiet-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Update password"}</button></form> : <button className="secondary-button" onClick={() => setOpen(true)}>Change password</button>}</section>;
}

function KeyRoundIcon() {
  return <span className="account-security-icon"><LockKeyhole size={18} /></span>;
}

function MemberDirectory({ members, actor, runAction, busy, notify }: { members: Member[]; actor: Actor; runAction: (action: string, payload: ActionPayload, success: string) => Promise<boolean>; busy: boolean; notify: (message: string) => void }) {
  async function copyAccessLink(member: Member) {
    const link = `${window.location.origin}/?auth=activate&email=${encodeURIComponent(member.email)}`;
    try {
      await navigator.clipboard.writeText(link);
      notify(`Sign-in link copied for ${member.name}`);
    } catch {
      notify("Could not copy the link. Open the sign-in page and copy it from the address bar.");
    }
  }
  async function emailInvite(member: Member) {
    await runAction("resendMemberInvite", { memberId: member.id }, `Invitation emailed to ${member.email}`);
  }
  if (!members.length) return <div className="member-empty"><Users size={18} /><span><b>No members yet</b><small>Invite the first person who should have access.</small></span></div>;
  return <div className="member-list managed-members">
    <div className="member-head"><span>Member</span><span>Role</span><span>Activity</span><span>Access</span><span>Invite</span></div>
    {members.map((member) => {
      const isSelf = member.id === actor.id;
      const roles = member.client_id ? [["client_admin", "Client admin"], ["client_tester", "Client tester"], ["client_viewer", "Client viewer"]] : [["agency_admin", "Agency admin"], ["project_manager", "Project manager"], ["developer", "Developer"]];
      return <div key={member.id} className={member.active === "1" ? "" : "member-suspended"}>
        <span className="member-person"><i style={avatarStyle(member.name)}>{initials(member.name)}</i><span><b>{member.name}{isSelf ? <em>You</em> : null}</b><small>{member.email}</small></span></span>
        <select aria-label={`Role for ${member.name}`} value={member.role} disabled={busy || isSelf || actor.role !== "agency_admin" && actor.role !== "client_admin"} onChange={(event) => runAction("updateMember", { memberId: member.id, role: event.target.value }, `Role updated for ${member.name}`)}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <span className="member-activity"><Clock3 size={13} />{member.last_seen_at ? `Seen ${formatDate(member.last_seen_at)}` : `Invited ${formatDate(member.invited_at || member.created_at)}`}</span>
        <button className={member.active === "1" ? "access-toggle active" : "access-toggle"} disabled={busy || isSelf || actor.role !== "agency_admin" && actor.role !== "client_admin"} onClick={() => runAction("updateMember", { memberId: member.id, active: member.active === "1" ? "0" : "1" }, member.active === "1" ? `Access suspended for ${member.name}` : `Access restored for ${member.name}`)}>{member.active === "1" ? <><UserCheck size={14} /> Active</> : <><UserX size={14} /> Suspended</>}</button>
        <span className="member-invite-actions"><button onClick={() => copyAccessLink(member)} aria-label={`Copy activation link for ${member.name}`} title="Copy activation link"><Copy size={14} /></button><button onClick={() => emailInvite(member)} aria-label={`Resend invitation to ${member.name}`} title="Resend invitation" disabled={busy || member.active !== "1"}><Mail size={14} /></button></span>
      </div>;
    })}
  </div>;
}

function Reports({ data }: { data: Workspace }) {
  const total = data.tickets.length; const complete = data.tickets.filter((ticket) => closedStatuses.has(ticket.status)).length; const completion = total ? Math.round((complete / total) * 100) : 0; const types = ["Bug", "Change request", "Content", "Question"];
  function exportCsv() { exportTicketsCsv(data.tickets, "deliveryloop-uat-report.csv", data.projects, data.releases); }
  return <div className="page-content report-page"><div className="report-actions"><p>Portfolio-wide UAT performance and delivery evidence.</p><button className="secondary-button" onClick={exportCsv}><Download size={15} /> Export CSV</button></div><div className="report-grid"><article className="surface completion-panel"><header className="section-header"><div><p>Portfolio health</p><h2>UAT completion</h2></div><span>{completion}%</span></header><div className="completion-body"><div className="completion-meter"><i style={{ width: `${completion}%` }} /></div><dl><div><dt>Feedback captured</dt><dd>{total}</dd></div><div><dt>Verified or closed</dt><dd>{complete}</dd></div><div><dt>Open blockers</dt><dd>{data.tickets.filter((ticket) => !closedStatuses.has(ticket.status) && ["Critical", "High"].includes(ticket.severity)).length}</dd></div></dl></div></article><article className="surface type-panel"><header className="section-header"><div><p>Scope clarity</p><h2>Feedback by type</h2></div></header><div className="type-bars">{types.map((type) => { const count = data.tickets.filter((ticket) => ticket.type === type).length; return <div key={type}><span><b>{type}</b><em>{count}</em></span><i><u style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></i></div>; })}</div></article></div><article className="surface audit-panel"><header className="section-header"><div><p>Evidence</p><h2>Acceptance trail</h2></div><FileText size={17} /></header><div className="audit-table"><div className="audit-head"><span>Event</span><span>Actor</span><span>Details</span><span>Date</span></div>{data.audit.map((event) => <div key={event.id}><b>{event.action}</b><span>{event.actor}</span><span>{event.details || "—"}</span><time>{formatDate(event.created_at, true)}</time></div>)}</div></article></div>;
}

function FeedbackDrawer({ ticket, actor, project, release, comments, attachments, audit, siblingTickets, openTicketByKey, assigneeOptions, templates, mentionNames, isClientView, canRespond, close, runAction, busy, notify }: { ticket: Ticket; actor: Actor; project?: Project; release?: Release; comments: Comment[]; attachments: Attachment[]; audit: AuditEvent[]; siblingTickets: Ticket[]; openTicketByKey: (key: string) => void; assigneeOptions: string[]; templates: ReplyTemplate[]; mentionNames: string[]; isClientView: boolean; canRespond: boolean; close: () => void; runAction: RunAction; busy: boolean; notify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  // The edit form asks per-type questions like the create form does, so the type
  // select drives the labels rather than just being submitted alongside them.
  const [editType, setEditType] = useState(ticket.type);
  const editLabels = feedbackFieldsFor(editType);
  const [duplicatePicker, setDuplicatePicker] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  // null = the reason form is closed. A retest that failed is the one moment the
  // team learns something, so it asks before flipping the status.
  const [retestReason, setRetestReason] = useState<string | null>(null);
  const visibleComments = comments.filter((comment) => !isClientView || comment.visibility === "public");
  const ticketAttachments = attachments.filter((attachment) => !attachment.comment_id);
  const commentAttachment = (commentId: string) => attachments.find((attachment) => attachment.comment_id === commentId);
  const chip = slaChip(ticket);
  const isReporter = ticket.reporter === actor.name;
  const canEdit = !isClientView || (isReporter && canRespond && ["Submitted", "Triaged", "Needs information"].includes(ticket.status));
  const canWithdraw = !closedStatuses.has(ticket.status) && (!isClientView || (isReporter && canRespond));
  const assignees = assigneeOptions.includes(ticket.assignee) ? assigneeOptions : [...assigneeOptions, ticket.assignee];
  const timeline = audit.slice(0, 12);

  function quickUpdate(fieldName: "status" | "priority" | "assignee", value: string, success: string) {
    void runAction("updateTicket", { ticketId: ticket.id, field: fieldName, value }, success, (workspace) => ({
      ...workspace,
      tickets: workspace.tickets.map((entry) => entry.id === ticket.id ? { ...entry, [fieldName]: value } : entry),
    }));
  }

  async function uploadScreenshot(file: File) {
    const uploadData = new FormData();
    uploadData.append("file", file);
    const upload = await fetch("/api/uploads", { method: "POST", body: uploadData });
    const body = await upload.json() as { key?: string; error?: string };
    if (!upload.ok || !body.key) throw new Error(body.error || "Screenshot upload failed");
    return body.key;
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = replyBody.trim();
    if (!body) return;
    let attachmentKey = "";
    try {
      const file = form.get("screenshot");
      if (file instanceof File && file.size) attachmentKey = await uploadScreenshot(file);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Screenshot upload failed");
      return;
    }
    await runAction("addComment", { ticketId: ticket.id, body, visibility: isClientView ? "public" : field(form, "visibility") || "public", ...(attachmentKey ? { attachmentKey } : {}) }, "Update added");
    formElement.reset();
    setReplyBody("");
  }

  function insertText(text: string) {
    setReplyBody((current) => current ? `${current.replace(/\s+$/, "")} ${text}` : text);
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction("editTicket", {
      ticketId: ticket.id,
      type: editType,
      severity: field(form, "severity"),
      title: field(form, "title"),
      actual: field(form, "actual"),
      // Switching to Question hides the field entirely, so the form no longer
      // carries it. Send "" explicitly rather than the stale stored answer.
      expected: editLabels.expected ? field(form, "expected") : "",
      pageUrl: field(form, "pageUrl"),
    }, "Feedback updated");
    setEditing(false);
  }

  function startEditing() {
    setEditType(ticket.type);
    setEditing(true);
  }

  function withdraw() {
    if (!window.confirm(`Withdraw ${ticket.key}? It will be closed and the other side will be notified.`)) return;
    void runAction("withdrawTicket", { ticketId: ticket.id }, "Feedback withdrawn");
  }

  async function submitReopen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = (retestReason || "").trim();
    if (note.length < 10) { notify("Tell the team what is still wrong (at least 10 characters)"); return; }
    const ok = await runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Reopened", note }, "Sent back to the team");
    if (ok) setRetestReason(null);
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="feedback-drawer">
    <header>
      <div><p>{ticket.key} · {project?.name}</p><h2>{ticket.title}</h2></div>
      <span className="drawer-header-actions">
        {canEdit && !editing ? <button onClick={startEditing} aria-label="Edit feedback" title="Edit feedback"><Pencil size={16} /></button> : null}
        {canWithdraw ? <button onClick={withdraw} disabled={busy} aria-label="Withdraw feedback" title="Withdraw feedback"><Trash2 size={16} /></button> : null}
        <button onClick={close} aria-label="Close feedback"><X size={19} /></button>
      </span>
    </header>
    <div className="drawer-scroll">
      <div className="badge-row">
        <TypeBadge value={ticket.type} /><SeverityBadge value={ticket.severity} />
        {chip ? <SlaChip chip={chip} /> : null}
        {ticket.duplicate_of ? <button className="duplicate-badge" onClick={() => openTicketByKey(ticket.duplicate_of || "")}><Copy size={12} /> Duplicate of {ticket.duplicate_of}</button> : null}
      </div>
      {editing ? (
        <form className="edit-form surface" onSubmit={submitEdit}>
          <label>Feedback type<select name="type" value={editType} onChange={(event) => setEditType(event.target.value)}>{feedbackTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Severity<select name="severity" defaultValue={ticket.severity}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label className="span-2">Title<input name="title" defaultValue={ticket.title} required maxLength={180} /></label>
          <label className="span-2">{editLabels.actual}<textarea name="actual" defaultValue={ticket.actual} placeholder={editLabels.actualHint} required /></label>
          {editLabels.expected ? <label className="span-2">{editLabels.expected}{editLabels.expectedRequired ? null : <em className="optional-tag">optional</em>}<textarea name="expected" defaultValue={ticket.expected} placeholder={editLabels.expectedHint} required={editLabels.expectedRequired} /></label> : null}
          <label className="span-2">Page or screen<input name="pageUrl" defaultValue={ticket.page_url} /></label>
          <footer className="span-2"><button type="button" className="quiet-button" onClick={() => setEditing(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></footer>
        </form>
      ) : (
        // A Question has no expected result, and a Content report often has no
        // suggested wording. Rendering an empty "Expected" block asked the
        // reader to notice an absence; omitting it says nothing was claimed.
        <section className="problem-card"><div><span>{feedbackFieldsFor(ticket.type).actual}</span><p>{ticket.actual}</p></div>{ticket.expected ? <div><span>{feedbackFieldsFor(ticket.type).expected || "Expected"}</span><p>{ticket.expected}</p></div> : null}</section>
      )}
      {ticket.attachment_key || ticketAttachments.length ? <div className="attachment-list">
        {ticket.attachment_key ? <a className="attachment-link" href={`/api/uploads/${encodeURIComponent(ticket.attachment_key)}`} target="_blank" rel="noreferrer"><Paperclip size={15} /> Screenshot <ExternalLink size={13} /></a> : null}
        {ticketAttachments.map((attachment, index) => <a key={attachment.id} className="attachment-link" href={`/api/uploads/${encodeURIComponent(attachment.key)}`} target="_blank" rel="noreferrer"><Paperclip size={15} /> Screenshot {ticket.attachment_key ? index + 2 : index + 1} <ExternalLink size={13} /></a>)}
      </div> : null}
      <section className="property-grid">
        <label>Status<select disabled={busy || isClientView} value={ticket.status} onChange={(event) => quickUpdate("status", event.target.value, `Status changed to ${event.target.value}`)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Priority<select disabled={busy || isClientView} value={ticket.priority} onChange={(event) => quickUpdate("priority", event.target.value, `Priority changed to ${event.target.value}`)}>{["Urgent", "High", "Normal", "Low"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        <label>Assignee<select disabled={busy || isClientView} value={ticket.assignee} onChange={(event) => quickUpdate("assignee", event.target.value, `Assigned to ${event.target.value}`)}>{assignees.map((person) => <option key={person}>{person}</option>)}</select></label>
        <label>Release<span>{release?.version} · {ticket.build}</span></label>
      </section>
      {!isClientView && !ticket.duplicate_of ? (
        duplicatePicker ? (
          <div className="duplicate-picker">
            <span>Duplicate of</span>
            <select defaultValue="" onChange={(event) => { const key = event.target.value; if (key) { setDuplicatePicker(false); void runAction("markDuplicate", { ticketId: ticket.id, duplicateKey: key }, `${ticket.key} marked as duplicate of ${key}`); } }}>
              <option value="" disabled>Choose the original feedback</option>
              {siblingTickets.map((item) => <option key={item.id} value={item.key}>{item.key} · {item.title.slice(0, 60)}</option>)}
            </select>
            <button className="quiet-button" onClick={() => setDuplicatePicker(false)}>Cancel</button>
          </div>
        ) : (
          <button className="link-button" onClick={() => setDuplicatePicker(true)}><Copy size={13} /> Mark as duplicate of another feedback</button>
        )
      ) : null}
      {/* Screen size is only ever the capture tool's measurement of the page
          under test. It used to fall back to DeliveryLoop's own window size,
          which is a confident answer to a question nobody asked — worse than no
          answer, because a developer would go and reproduce at that width. The
          raw user agent rides along as a tooltip for the delivery team only. */}
      <section className="context-panel"><header><MonitorSmartphone size={15} /> Captured context</header><dl>
        <div><dt>Page</dt><dd>{ticket.page_url || "Not supplied"}</dd></div>
        <div><dt>Browser</dt><dd title={!isClientView && ticket.user_agent ? ticket.user_agent : undefined}>{ticket.browser || "Not supplied"}</dd></div>
        <div><dt>Screen size</dt><dd>{ticket.viewport || <span className="context-missing">Not captured — use the capture tool on the staging page to record it</span>}</dd></div>
        <div><dt>Reporter</dt><dd>{ticket.reporter}</dd></div>
      </dl></section>
      {isClientView && canRespond && ticket.status === "Ready for retest" ? <section className="retest-panel"><div><RefreshCcw size={18} /><span><b>A fix is ready to test</b><small>Confirm the result in {release?.build}.</small></span></div>{retestReason === null
        ? <footer><button className="secondary-button" onClick={() => setRetestReason("")}>Still broken</button><button className="primary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Verified" }, "Fix verified")}>Verify fix</button></footer>
        : <form className="retest-reason" onSubmit={submitReopen}><label htmlFor="retest-reason-note">What is still wrong?</label><textarea id="retest-reason-note" value={retestReason} maxLength={1000} required onChange={(event) => setRetestReason(event.target.value)} placeholder="What did you do, and what happened instead? This is sent to the team as a reply." /><footer><button type="button" className="quiet-button" onClick={() => setRetestReason(null)}>Cancel</button><button className="secondary-button" disabled={busy || retestReason.trim().length < 10}>Send it back</button></footer></form>}</section> : null}
      {timeline.length ? <section className="ticket-timeline">
        <header><Activity size={14} /> History</header>
        <div>{timeline.map((event) => <div key={event.id} className="timeline-row"><span className="timeline-dot" /><p><b>{event.action}</b>{event.details ? <>· {event.details}</> : null}<small>{event.actor} · {formatDate(event.created_at, true)}</small></p></div>)}</div>
      </section> : null}
      <section className="conversation">
        <header><div><p>Conversation</p><h3>{visibleComments.length} updates</h3></div></header>
        {visibleComments.map((comment) => {
          const attachment = commentAttachment(comment.id);
          return <div className={`comment ${comment.visibility}`} key={comment.id}><span className="avatar small" style={avatarStyle(comment.author)}>{initials(comment.author)}</span><div><p><b>{comment.author}</b>{comment.visibility === "internal" ? <em>Internal</em> : null}<time>{formatDate(comment.created_at)}</time></p><div>{comment.body}</div>{attachment ? <a className="attachment-link small" href={`/api/uploads/${encodeURIComponent(attachment.key)}`} target="_blank" rel="noreferrer"><Paperclip size={13} /> Attached screenshot <ExternalLink size={12} /></a> : null}</div></div>;
        })}
        {canRespond ? <form className="reply-form" onSubmit={submitReply}>
          <textarea name="body" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={isClientView ? "Reply to the delivery team" : "Add an update"} required />
          {mentionNames.length ? <div className="mention-row"><span>Mention</span>{mentionNames.slice(0, 6).map((name) => <button type="button" key={name} className="mention-chip" onClick={() => insertText(`@${name}`)}>@{name}</button>)}</div> : null}
          <footer className="reply-toolbar">
            {!isClientView && templates.length ? <select className="template-picker" value="" aria-label="Insert a saved reply" onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) insertText(template.body); }}>
              <option value="" disabled>Saved reply…</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select> : null}
            <label className="reply-attach" title="Attach a screenshot"><Paperclip size={14} /><input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><span>Screenshot</span></label>
            {!isClientView ? <label><input type="checkbox" name="visibility" value="internal" /> Internal note</label> : null}
            <button className="primary-button" disabled={busy}><Send size={14} /> Send</button>
          </footer>
        </form> : <p className="approval-note">This account has read-only access to the conversation.</p>}
      </section>
    </div>
  </aside></div>;
}

function TeamModal({ project, members, team, actor, close, runAction, busy }: { project: Project; members: Member[]; team: ProjectTeamRow[]; actor: Actor; close: () => void; runAction: RunAction; busy: boolean }) {
  const staff = members.filter((member) => !member.client_id && member.active === "1");
  const [selected, setSelected] = useState<string[]>(team.map((row) => row.member_id));
  function toggle(memberId: string) {
    setSelected((current) => current.includes(memberId) ? current.filter((item) => item !== memberId) : [...current, memberId]);
  }
  async function save() {
    const ok = await runAction("updateProjectTeam", { projectId: project.id, memberIds: selected }, selected.length ? "Project team updated" : "Project opened to all teammates");
    if (ok) close();
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card team-card" role="dialog" aria-modal="true" aria-label={`Project team for ${project.name}`}>
      <header><div><p>Project team</p><h2>{project.name}</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header>
      <div className="team-shell">
        <div className="modal-callout"><ShieldCheck size={17} /><span>Only admins and the teammates selected here can open this project&apos;s releases and feedback. Everyone else sees an overview card. Leave everyone unticked to keep the project open to the whole team.</span></div>
        <div className="team-member-list">
          {staff.map((member) => {
            const isSelf = member.id === actor.id;
            const locked = isSelf && actor.role === "project_manager" && selected.includes(member.id) && selected.length > 1;
            return <label key={member.id} className={`team-member-row ${selected.includes(member.id) ? "picked" : ""}`}>
              <input type="checkbox" checked={selected.includes(member.id)} disabled={busy || locked} onChange={() => toggle(member.id)} />
              <span className="team-member-avatar" style={avatarStyle(member.name)}>{initials(member.name)}</span>
              <span className="team-member-info"><b>{member.name}{isSelf ? " (you)" : ""}</b><small>{roleLabel(member.role)} · {member.email}</small></span>
            </label>;
          })}
          {!staff.length ? <div className="member-empty"><Users size={18} /><span><b>No internal teammates yet</b><small>Add teammates in Team &amp; security first.</small></span></div> : null}
        </div>
        <footer className="team-footer"><span>{selected.length ? `${selected.length} on the team` : "Open to all teammates"}</span><div><button type="button" className="quiet-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save team"}</button></div></footer>
      </div>
    </section>
  </div>;
}

type DiffLine = { kind: "same" | "add" | "del"; text: string };

function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lines.push({ kind: "same", text: a[i] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) { lines.push({ kind: "del", text: a[i] }); i++; }
    else { lines.push({ kind: "add", text: b[j] }); j++; }
  }
  while (i < a.length) lines.push({ kind: "del", text: a[i++] });
  while (j < b.length) lines.push({ kind: "add", text: b[j++] });
  return lines;
}

function ScopePanel({ project, versions, canEdit, isClientView, close, runAction, busy }: { project: Project; versions: ScopeVersion[]; canEdit: boolean; isClientView: boolean; close: () => void; runAction: RunAction; busy: boolean }) {
  const ordered = [...versions].sort((a, b) => a.version - b.version);
  const latest = ordered.length ? ordered[ordered.length - 1] : undefined;
  const [mode, setMode] = useState<"current" | "history" | "edit" | "compare">(versions.length ? "current" : canEdit ? "edit" : "current");
  const [viewing, setViewing] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [draft, setDraft] = useState(latest?.body || "");
  const [note, setNote] = useState("");

  function startEdit(body: string, prefillNote = "") { setDraft(body); setNote(prefillNote); setMode("edit"); }
  function toggleSelect(version: number) {
    setSelected((current) => current.includes(version) ? current.filter((item) => item !== version) : [...current.slice(current.length >= 2 ? 1 : 0), version]);
  }
  async function save() {
    const ok = await runAction("saveScope", { projectId: project.id, body: draft.trim(), changeNote: note.trim() }, ordered.length ? "Scope revision saved" : "Scope of work recorded");
    if (ok) { setMode("current"); setSelected([]); setViewing(null); }
  }

  const [lowVersion, highVersion] = [...selected].sort((a, b) => a - b);
  const compareOlder = ordered.find((version) => version.version === lowVersion);
  const compareNewer = ordered.find((version) => version.version === highVersion);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card scope-card" role="dialog" aria-modal="true" aria-label={`Scope of work for ${project.name}`}>
      <header><div><p>Scope of work</p><h2>{project.name}</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header>
      <div className="scope-shell">
        <nav className="scope-tabs" aria-label="Scope views">
          <button className={mode === "current" || mode === "edit" ? "active" : ""} onClick={() => { setMode(latest || !canEdit ? "current" : "edit"); setViewing(null); }}><FileText size={14} /> Current</button>
          <button className={mode === "history" || mode === "compare" ? "active" : ""} disabled={!ordered.length} onClick={() => { setMode("history"); setViewing(null); }}><Clock3 size={14} /> Version history{ordered.length ? <em>{ordered.length}</em> : null}</button>
        </nav>

        {mode === "current" ? (latest ? <>
          <div className="scope-meta">
            <span className="scope-version-badge">v{latest.version}</span>
            <div><b>{latest.author}</b><small>{roleLabel(latest.author_role)} · {formatDate(latest.created_at, true)}</small></div>
            {canEdit ? <button className="secondary-button" onClick={() => startEdit(latest.body)}><Pencil size={14} /> Revise scope</button> : null}
          </div>
          {latest.change_note ? <p className="scope-note">{latest.change_note}</p> : null}
          <pre className="scope-body">{latest.body}</pre>
          {isClientView ? <div className="client-help"><ShieldCheck size={17} /><span><b>Every revision is recorded.</b><small>Version, author and date are kept for the full history of what was agreed.</small></span></div> : null}
        </> : <div className="empty-state"><FileText size={24} /><h3>No scope recorded yet</h3><p>{canEdit ? "Record what was initially agreed so every later revision is tracked with its author and version." : "The agreed scope of work has not been recorded for this project yet."}</p>{canEdit ? <button className="primary-button" onClick={() => startEdit("")}>Record the agreed scope</button> : null}</div>) : null}

        {mode === "edit" ? <div className="scope-editor">
          <label>Scope of work<textarea value={draft} maxLength={20000} onChange={(event) => setDraft(event.target.value)} placeholder={"Deliverables\n- What will be built\n\nOut of scope\n- What is explicitly excluded\n\nTip: paste rows straight from your SOW sheet and press “Format as deliverables”"} /></label>
          <div className="field-actions">
            <label className="quiet-button sheet-upload"><UploadCloud size={13} /> Upload sheet (.csv)
              <input type="file" accept=".csv,.tsv,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const formatted = sheetToScope(String(reader.result || "")); if (formatted) setDraft((current) => current.trim() ? `${current.trim()}\n\n${formatted}` : formatted); }; reader.readAsText(file); event.target.value = ""; }} />
            </label>
            <button type="button" className="quiet-button" disabled={!draft.trim()} onClick={() => setDraft(sheetToScope(draft))}><Type size={13} /> Format as deliverables</button>
            <em>Copy rows from your Google Sheet SOW and paste them above — formatting turns each row into a deliverable bullet that can later generate the UAT checklist.</em>
          </div>
          {ordered.length ? <label>What changed in this revision?<input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Added the coupon engine agreed on the review call" /></label> : null}
          <p className="scope-editor-hint"><ShieldCheck size={14} /> Saving creates a new version. Earlier versions are never changed or deleted.</p>
          <footer><button type="button" className="quiet-button" onClick={() => { setMode("current"); }}>Cancel</button><button className="primary-button" disabled={busy || !draft.trim() || (ordered.length > 0 && !note.trim())} onClick={() => void save()}>{busy ? "Saving…" : ordered.length ? `Save as v${(latest?.version || 0) + 1}` : "Save initial scope (v1)"}</button></footer>
        </div> : null}

        {mode === "history" ? <div className="scope-history">
          <div className="scope-compare-bar">
            <span>{selected.length === 2 ? "Ready to compare the selected versions" : "Tick any two versions to compare them"}</span>
            <button className="secondary-button" disabled={selected.length !== 2} onClick={() => setMode("compare")}><GitCompare size={14} /> Compare selected</button>
          </div>
          <div className="scope-version-list">
            {[...ordered].reverse().map((version) => <div key={version.id} className="scope-version-row">
              <div className="scope-version-line">
                <label className="scope-check" title="Select for comparison"><input type="checkbox" aria-label={`Select v${version.version} for comparison`} checked={selected.includes(version.version)} onChange={() => toggleSelect(version.version)} /></label>
                <button className="scope-version-main" onClick={() => setViewing(viewing === version.version ? null : version.version)}>
                  <span className="scope-version-badge">v{version.version}</span>
                  <span className="scope-version-info"><b>{version.change_note || (version.version === 1 ? "Initial agreed scope" : "Revision")}</b><small>{version.author} · {roleLabel(version.author_role)} · {formatDate(version.created_at, true)}</small></span>
                  {version.version === latest?.version ? <em className="scope-current-chip">Current</em> : null}
                </button>
              </div>
              {viewing === version.version ? <div className="scope-version-detail"><pre className="scope-body">{version.body}</pre>{canEdit && version.version !== latest?.version ? <button className="secondary-button" onClick={() => startEdit(version.body, `Restored from v${version.version}`)}><RefreshCcw size={14} /> Restore as new version</button> : null}</div> : null}
            </div>)}
          </div>
        </div> : null}

        {mode === "compare" && compareOlder && compareNewer ? (() => {
          const lines = diffLines(compareOlder.body, compareNewer.body);
          const added = lines.filter((line) => line.kind === "add").length;
          const removed = lines.filter((line) => line.kind === "del").length;
          return <div className="scope-compare">
            <div className="scope-compare-head">
              <button className="quiet-button" onClick={() => setMode("history")}>Back to history</button>
              <span className="scope-diff-count"><em className="add">+{added} added</em><em className="del">−{removed} removed</em></span>
            </div>
            <div className="scope-compare-title">
              <span><i className="scope-version-badge">v{compareOlder.version}</i><b>{compareOlder.author}</b><small>{formatDate(compareOlder.created_at, true)}</small></span>
              <GitCompare size={15} />
              <span><i className="scope-version-badge">v{compareNewer.version}</i><b>{compareNewer.author}</b><small>{formatDate(compareNewer.created_at, true)}</small></span>
            </div>
            <div className="scope-diff">{lines.map((line, index) => <div key={index} className={`diff-line ${line.kind}`}><span>{line.kind === "add" ? "+" : line.kind === "del" ? "−" : ""}</span><p>{line.text || " "}</p></div>)}</div>
          </div>;
        })() : null}
      </div>
    </section>
  </div>;
}

function ActionModal({ modal, data, isClientView, selectedRelease, memberClientId, editProject, prefill, close, runAction, busy, notify }: { modal: Exclude<Modal, null>; data: Workspace; isClientView: boolean; selectedRelease?: Release; memberClientId: string | null; editProject?: Project; prefill: ReportPrefill | null; close: () => void; runAction: RunAction; busy: boolean; notify: (message: string) => void }) {
  const isAgencyMember = modal === "member" && memberClientId === "agency";
  // An approved release is sealed evidence: new feedback against it would change
  // an already-signed acceptance report, and the server rejects it anyway.
  const reportableReleases = data.releases.filter((release) => release.status !== "Approved");
  const [relProjectId, setRelProjectId] = useState(data.projects[0]?.id || "");
  const [checklistText, setChecklistText] = useState("");
  // The report form used to be fully uncontrolled. The type now decides which
  // fields exist and what they are called, so it has to be state.
  const [feedbackType, setFeedbackType] = useState("Bug");
  const [shots, setShots] = useState<Shot[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const shotUrlsRef = useRef<string[]>([]);
  const labels = feedbackFieldsFor(feedbackType);
  const scopeForProject = (data.scope || []).filter((version) => version.project_id === relProjectId);

  // Object URLs are process-lifetime leaks until revoked. Removing a thumbnail
  // revokes immediately; this catches everything still on screen when the modal
  // closes, including a submit that never completed.
  useEffect(() => { shotUrlsRef.current = shots.map((shot) => shot.url); }, [shots]);
  useEffect(() => () => { for (const url of shotUrlsRef.current) URL.revokeObjectURL(url); }, []);

  /**
   * Accepts screenshots from the file picker, a drop, or a paste.
   *
   * The size and type rules are checked here as well as on the server. The UI
   * promises "8 MB, PNG/JPG/WebP/GIF" and, without this, a 40 MB screenshot was
   * uploaded in full over a hotel wifi before the server said no.
   */
  function addShots(incoming: FileList | File[] | null | undefined) {
    const files = Array.from(incoming || []).filter((file) => file.size > 0);
    if (!files.length) return;
    const accepted: Shot[] = [];
    const problems: string[] = [];
    for (const file of files) {
      if (shots.length + accepted.length >= MAX_SHOTS) { problems.push(`Up to ${MAX_SHOTS} screenshots — the rest were skipped`); break; }
      if (!SHOT_TYPES.has(file.type)) { problems.push(`${file.name || "That file"} is not a PNG, JPG, WebP or GIF`); continue; }
      if (file.size > MAX_SHOT_BYTES) { problems.push(`${file.name || "That image"} is larger than 8 MB`); continue; }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length) setShots((current) => [...current, ...accepted]);
    if (problems.length) notify(problems[0]);
  }

  function removeShot(url: string) {
    URL.revokeObjectURL(url);
    setShots((current) => current.filter((shot) => shot.url !== url));
  }

  // PrtSc then Ctrl+V is how testers actually produce a screenshot, and a
  // bookmarklet cannot capture one for them. Anywhere in the form will do.
  function pasteShots(event: ClipboardEvent<HTMLFormElement>) {
    if (modal !== "feedback") return;
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    addShots(files);
  }

  function dropShots(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    addShots(event.dataTransfer?.files);
  }

  async function uploadShot(file: File) {
    const uploadData = new FormData();
    uploadData.append("file", file);
    const upload = await fetch("/api/uploads", { method: "POST", body: uploadData });
    const body = await upload.json() as { key?: string; error?: string };
    if (!upload.ok || !body.key) throw new Error(body.error || "Screenshot upload failed");
    return body.key;
  }

  function generateChecklist() {
    const latest = scopeForProject.length ? scopeForProject.reduce((a, b) => (a.version > b.version ? a : b)) : undefined;
    if (!latest) { notify("No scope of work recorded for this project yet — add it from the Projects page first"); return; }
    const items = checklistFromScope(latest.body);
    if (!items.length) { notify("Could not find deliverable lines in the scope — list deliverables as bullets (- item) and try again"); return; }
    setChecklistText(items.map((item) => `Verify: ${item}`).join("\n"));
    notify(`${items.length} acceptance flows drafted from scope v${latest.version} — edit freely before saving`);
  }
  function insertChecklistTemplate(templateId: string) {
    const template = (data.checklistTemplates || []).find((item) => item.id === templateId);
    if (!template) return;
    setChecklistText((current) => [current.trim(), template.items].filter(Boolean).join("\n"));
    notify(`Inserted “${template.title}”`);
  }
  async function saveChecklistTemplate() {
    const items = checklistText.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!items.length) { notify("Write or generate the checklist first, then save it as a template"); return; }
    const title = window.prompt("Name this checklist template, e.g. Standard web app UAT");
    if (!title?.trim()) return;
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createChecklistTemplate", payload: { title: title.trim(), checklist: items } }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save the template");
      notify(`Template “${title.trim()}” saved for future releases`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save the template");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      if (modal === "client") return runAction("createClient", { name: field(form, "name"), contactName: field(form, "contactName"), contactEmail: field(form, "contactEmail"), accent: field(form, "accent") }, "Client workspace created");
      if (modal === "member") return runAction("createMember", { clientId: isAgencyMember ? "" : memberClientId || field(form, "clientId"), name: field(form, "name"), email: field(form, "email"), role: field(form, "role") }, "Member access created");
      if (modal === "project") return runAction("createProject", { clientId: field(form, "clientId"), name: field(form, "name"), code: field(form, "code"), description: field(form, "description"), manager: field(form, "manager"), stage: "UAT", stagingUrl: field(form, "stagingUrl") }, "Project created");
      if (modal === "editProject") return runAction("updateProject", { projectId: editProject?.id || "", name: field(form, "name"), description: field(form, "description"), manager: field(form, "manager"), stage: editProject?.stage || "UAT", stagingUrl: field(form, "stagingUrl") }, "Project updated");
      if (modal === "release") return runAction("createRelease", { projectId: field(form, "projectId"), name: field(form, "name"), version: field(form, "version"), build: field(form, "build"), startDate: field(form, "startDate"), dueDate: field(form, "dueDate"), testingNotes: field(form, "testingNotes"), testCredentials: field(form, "testCredentials"), checklist: field(form, "checklist").split("\n").filter(Boolean), openNow: field(form, "openNow") ? "1" : "0" }, field(form, "openNow") ? "Release opened for client testing" : "Release saved as a draft");
      if (modal === "editRelease") return runAction("updateRelease", { releaseId: selectedRelease?.id || "", name: field(form, "name"), version: field(form, "version"), build: field(form, "build"), startDate: field(form, "startDate"), dueDate: field(form, "dueDate"), testingNotes: field(form, "testingNotes"), testCredentials: field(form, "testCredentials") }, "Release updated");
      // Parallel, and all-or-nothing. The old sequential loop threw on the first
      // failure and walked away from every object it had already stored, so a
      // dropped connection on shot 3 of 3 orphaned two paid-for R2 objects that
      // nothing referenced and nobody could reach.
      const results = await Promise.allSettled(shots.map((shot) => uploadShot(shot.file)));
      const attachmentKeys = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failed = results.find((result) => result.status === "rejected");
      if (failed) {
        await Promise.allSettled(attachmentKeys.map((key) => fetch(`/api/uploads/${encodeURIComponent(key)}`, { method: "DELETE" })));
        throw new Error(failed.reason instanceof Error ? failed.reason.message : "Screenshot upload failed");
      }
      const releaseId = field(form, "releaseId") || pickDefaultRelease(reportableReleases)?.id; const release = data.releases.find((item) => item.id === releaseId);
      if (!release) throw new Error("Choose a release before reporting feedback");
      // `viewport` carries the bookmarklet's measurement of the page under test,
      // or whatever the reporter typed, or nothing. It is never this tab's own
      // window size — that measures DeliveryLoop, not the thing that broke.
      await runAction("createTicket", { projectId: release.project_id, releaseId: release.id, type: feedbackType, title: field(form, "title"), actual: field(form, "actual"), expected: field(form, "expected"), severity: field(form, "severity"), pageUrl: field(form, "pageUrl"), browser: parseBrowser(), userAgent: rawUserAgent(), viewport: field(form, "viewport"), build: release.build, attachmentKeys }, "Feedback submitted");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save");
    }
  }
  const title = modal === "member" && isAgencyMember ? "Add internal teammate" : ({ feedback: "Report feedback", project: "Create project", editProject: "Edit project", release: "Prepare release", editRelease: "Edit release", client: "Create client workspace", member: "Invite workspace member" } as Record<Exclude<Modal, null>, string>)[modal];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><p>DeliveryLoop</p><h2>{title}</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header><form onSubmit={submit} onPaste={pasteShots}>
    {modal === "feedback" ? <>
      <div className="client-help span-2"><MessageSquareWarning size={17} /><span><b>Describe what you saw.</b><small>Screenshots help most — press Print Screen, then paste straight into this form.</small></span></div>
      <label className="span-2">Release<select name="releaseId" defaultValue={selectedRelease && selectedRelease.status !== "Approved" ? selectedRelease.id : pickDefaultRelease(reportableReleases)?.id}>{reportableReleases.map((release) => <option key={release.id} value={release.id}>{data.projects.find((project) => project.id === release.project_id)?.name} · {release.version}</option>)}</select></label>
      <label>Feedback type<select name="type" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)}>{feedbackTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>Severity<select name="severity" defaultValue="Medium"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
      <label className="span-2">Short title<input name="title" placeholder="Describe it clearly in one line" required maxLength={180} /></label>
      <label className="span-2">{labels.actual}<textarea name="actual" placeholder={labels.actualHint} required /></label>
      {labels.expected ? <label className="span-2">{labels.expected}{labels.expectedRequired ? null : <em className="optional-tag">optional</em>}<textarea name="expected" placeholder={labels.expectedHint} required={labels.expectedRequired} /></label> : null}
      <label className="span-2">Page or screen<input name="pageUrl" defaultValue={prefill?.pageUrl || ""} placeholder="/checkout/payment or a staging URL" /></label>
      <label className="span-2">Screen size{prefill?.viewport ? <em className="optional-tag">captured</em> : <em className="optional-tag">optional</em>}<input name="viewport" defaultValue={prefill?.viewport || ""} maxLength={80} placeholder="e.g. 1440 x 900 — leave blank if you are not sure" /></label>
      <div className="span-2 upload-block">
        {/* A label, so the whole panel opens the picker; the thumbnails and their
            remove buttons sit outside it, or every click would reopen the picker. */}
        <label className={dragOver ? "upload-field dropzone is-over" : "upload-field dropzone"} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={dropShots}>
          <UploadCloud size={18} />
          <span><b>Attach screenshots</b><small>Paste, drag them here, or choose files · up to {MAX_SHOTS} · PNG, JPG, WebP or GIF, 8 MB each</small></span>
          <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { addShots(event.target.files); event.target.value = ""; }} />
        </label>
        {shots.length ? <div className="shot-grid">{shots.map((shot) => <figure className="shot-thumb" key={shot.url}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview of a file that has not been uploaded yet; there is no remote URL to optimise. */}
          <img src={shot.url} alt={shot.file.name || "Screenshot to attach"} />
          <button type="button" onClick={() => removeShot(shot.url)} aria-label={`Remove ${shot.file.name || "screenshot"}`} title="Remove"><X size={12} /></button>
          <figcaption>{shot.file.name || "Pasted screenshot"}</figcaption>
        </figure>)}</div> : null}
      </div>
      {prefill?.pageUrl ? <div className="modal-callout span-2"><MonitorSmartphone size={16} /><span>Captured from the staging page{prefill.viewport ? ` at ${prefill.viewport}` : ""}. Check the details and submit.</span></div> : null}
    </> : null}
    {modal === "client" ? <><label className="span-2">Company name<input name="name" required placeholder="Acme Limited" /></label><label>Primary contact<input name="contactName" required placeholder="Contact name" /></label><label>Email<input name="contactEmail" type="email" required placeholder="client@company.com" /></label><label className="span-2">Workspace colour<input name="accent" type="color" defaultValue="#3157D5" /></label></> : null}
    {modal === "member" ? <><div className="modal-callout span-2"><ShieldCheck size={17} /><span>An activation email is sent to this exact address. Registration is invitation-only.</span></div>{!isAgencyMember ? <label className="span-2">Client<select name="clientId" defaultValue={memberClientId || ""} disabled={Boolean(memberClientId)}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label> : null}<label>Name<input name="name" required maxLength={120} placeholder="Full name" /></label><label>Email<input name="email" type="email" required maxLength={254} placeholder={isAgencyMember ? "person@agency.com" : "person@client.com"} /></label><label className="span-2">Role<select name="role" defaultValue={isAgencyMember ? "project_manager" : "client_tester"}>{isAgencyMember ? <><option value="agency_admin">Agency admin</option><option value="project_manager">Project manager</option><option value="developer">Developer</option></> : <><option value="client_admin">Client admin</option><option value="client_tester">Client tester</option><option value="client_viewer">Client viewer</option></>}</select></label></> : null}
    {modal === "project" || modal === "editProject" ? <>{modal === "project" ? <label className="span-2">Client<select name="clientId">{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label> : null}<label>Project name<input name="name" required defaultValue={editProject?.name} placeholder="Customer portal" /></label><label>Project code{modal === "project" ? <input name="code" required maxLength={8} placeholder="CPT" /> : <input value={editProject?.code || ""} readOnly disabled title="The code prefixes every feedback reference and cannot be changed" />}</label><label className="span-2">Purpose<textarea name="description" required defaultValue={editProject?.description} placeholder="What is being delivered?" /></label><label>Project lead<input name="manager" required defaultValue={editProject?.manager} placeholder="Team member" /></label><label>Staging URL<input name="stagingUrl" type="text" inputMode="url" defaultValue={editProject?.staging_url} placeholder="myapp.run.app or https://staging.example.com" /></label></> : null}
    {modal === "release" ? <><label className="span-2">Project<select name="projectId" value={relProjectId} onChange={(event) => setRelProjectId(event.target.value)}>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="span-2">Release name<input name="name" required placeholder="Checkout and promotions UAT" /></label><label>Version<input name="version" required placeholder="v1.0" /></label><label>Build<input name="build" required placeholder="build-001" /></label><label>Testing starts<input name="startDate" type="date" required /></label><label>Testing due<input name="dueDate" type="date" required /></label><label className="span-2">Testing instructions<textarea name="testingNotes" required placeholder="What should the client focus on?" /></label><label className="span-2">Test account (use throwaway credentials only — stored in plain text)<textarea name="testCredentials" maxLength={1000} placeholder={"One per line, e.g.\nUsername: uat.tester@example.com\nPassword: uat-only-2026"} /></label><label className="span-2">Acceptance checklist — one flow per line<textarea name="checklist" value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder={"Generate it from the agreed scope of work below, type it, or leave empty and add flows later"} /></label><div className="field-actions span-2"><button type="button" className="secondary-button" onClick={generateChecklist}><FileText size={13} /> Generate from scope of work{scopeForProject.length ? <em className="scope-version-chip">v{Math.max(...scopeForProject.map((version) => version.version))}</em> : null}</button>{(data.checklistTemplates || []).length ? <select className="template-picker" value="" aria-label="Insert a checklist template" onChange={(event) => insertChecklistTemplate(event.target.value)}><option value="" disabled>Insert template…</option>{data.checklistTemplates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select> : null}<button type="button" className="quiet-button" onClick={() => void saveChecklistTemplate()}>Save as template</button><em>Every deliverable in the agreed scope becomes a testable flow. You can also add or remove flows after the release is created.</em></div><label className="span-2 inline-check"><input type="checkbox" name="openNow" defaultChecked /><span><b>Open for client testing now</b><small>Makes the release visible in the client portal and emails their testers. Leave unticked to keep it as a draft.</small></span></label></> : null}
    {modal === "editRelease" && selectedRelease ? <><label className="span-2">Release name<input name="name" required maxLength={160} defaultValue={selectedRelease.name} /></label><label>Version<input name="version" required maxLength={40} defaultValue={selectedRelease.version} /></label><label>Build<input name="build" required maxLength={80} defaultValue={selectedRelease.build} /></label><label>Testing starts<input name="startDate" type="date" required defaultValue={selectedRelease.start_date} /></label><label>Testing due<input name="dueDate" type="date" required defaultValue={selectedRelease.due_date} /></label><label className="span-2">Testing instructions<textarea name="testingNotes" defaultValue={selectedRelease.testing_notes} /></label><label className="span-2">Test account (use throwaway credentials only — stored in plain text)<textarea name="testCredentials" maxLength={1000} defaultValue={selectedRelease.test_credentials || ""} placeholder={"One per line, e.g.\nUsername: uat.tester@example.com\nPassword: uat-only-2026"} /></label><div className="modal-callout span-2"><ShieldCheck size={16} /><span>Changes are recorded in the audit trail. Approved releases cannot be edited — they stay locked as acceptance evidence.</span></div></> : null}
    <footer><button type="button" className="quiet-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : isClientView && modal === "feedback" ? "Submit to delivery team" : "Save"}</button></footer>
  </form></section></div>;
}

// The class stays keyed off the internal status so the existing colour rules
// keep working — only the words the client reads change.
function StatusBadge({ value, client = false }: { value: string; client?: boolean }) {
  return <span className={`status-badge status-${value.toLowerCase().replaceAll(" ", "-").replaceAll("/", "-")}`}><i />{client ? clientStatusLabel[value] || value : value}</span>;
}

function TypeBadge({ value }: { value: string }) {
  const Icon = feedbackIcons[value] || MessageCircleQuestion;
  return <span className={`type-badge ${value.toLowerCase().replaceAll(" ", "-")}`}><Icon size={12} />{value}</span>;
}

function SeverityBadge({ value }: { value: string }) {
  return <span className={`severity-badge ${value.toLowerCase()}`}><i />{value} severity</span>;
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Inbox; title: string; body: string }) {
  return <div className="empty-state"><Icon size={24} /><h3>{title}</h3><p>{body}</p></div>;
}
