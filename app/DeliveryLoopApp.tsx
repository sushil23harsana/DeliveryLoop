"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bug,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderKanban,
  GitCompare,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageCircleQuestion,
  MessageSquareWarning,
  MonitorSmartphone,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  Moon,
  Pencil,
  Printer,
  Send,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Type,
  UploadCloud,
  UserPlus,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { AuthScreen } from "./AuthScreen";
import { authClient } from "./auth-client";

type Client = { id: string; name: string; contact_name: string; contact_email: string; accent: string; created_at: string };
type Member = { id: string; email: string; name: string; role: string; client_id: string | null; active: string; invited_by: string; invited_at: string | null; last_seen_at: string | null; updated_at: string | null; created_at: string };
type Project = { id: string; client_id: string; name: string; code: string; description: string; manager: string; stage: string; staging_url: string; created_at: string };
type Release = { id: string; project_id: string; name: string; version: string; build: string; status: string; start_date: string; due_date: string; testing_notes: string; approved_at: string | null; approved_by: string | null; created_at: string };
type ChecklistItem = { id: string; release_id: string; title: string; state: string; created_at: string };
type Ticket = { id: string; key: string; project_id: string; release_id: string; type: string; title: string; actual: string; expected: string; severity: string; priority: string; status: string; reporter: string; assignee: string; page_url: string; browser: string; viewport: string; build: string; attachment_key: string | null; duplicate_of: string | null; created_at: string; updated_at: string };
type Comment = { id: string; ticket_id: string; author: string; body: string; visibility: string; created_at: string };
type Attachment = { id: string; ticket_id: string; comment_id: string | null; key: string; uploaded_by: string; created_at: string };
type AuditEvent = { id: string; entity_type: string; entity_id: string; action: string; actor: string; details: string; created_at: string };
type ReplyTemplate = { id: string; title: string; body: string; created_by: string; created_at: string };
type ScopeVersion = { id: string; project_id: string; version: number; body: string; change_note: string; author: string; author_role: string; created_at: string };
type ProjectTeamRow = { id: string; project_id: string; member_id: string; added_by: string; created_at: string };
type DirectoryProject = { id: string; client_id: string; name: string; code: string; stage: string; manager: string; team: string[] };
type Actor = { id: string; email: string; name: string; role: string; clientId: string | null; isStaff: boolean };
type Workspace = { clients: Client[]; members: Member[]; projects: Project[]; releases: Release[]; checklist: ChecklistItem[]; tickets: Ticket[]; comments: Comment[]; audit: AuditEvent[]; attachments: Attachment[]; templates: ReplyTemplate[]; scope: ScopeVersion[]; projectTeam: ProjectTeamRow[]; directory: DirectoryProject[] };
type View = "overview" | "projects" | "releases" | "feedback" | "clients" | "reports" | "settings";
type Modal = "feedback" | "project" | "release" | "client" | "member" | null;
type ActionPayload = Record<string, string | string[]>;
type ReportPrefill = { pageUrl?: string; viewport?: string };
type RunAction = (action: string, payload: ActionPayload, success: string, optimistic?: (workspace: Workspace) => Workspace) => Promise<boolean>;

const closedStatuses = new Set(["Verified", "Closed", "Deferred", "Rejected / out of scope", "Withdrawn"]);
const statusOptions = ["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Reopened", "Verified", "Closed", "Deferred", "Rejected / out of scope", "Withdrawn"];

const boardColumns: { id: string; label: string; statuses: string[]; dropStatus: string }[] = [
  { id: "new", label: "New", statuses: ["Submitted", "Triaged"], dropStatus: "Triaged" },
  { id: "working", label: "In progress", statuses: ["In progress", "Needs information", "Approval required"], dropStatus: "In progress" },
  { id: "retest", label: "Client retest", statuses: ["Ready for retest", "Reopened"], dropStatus: "Ready for retest" },
  { id: "done", label: "Done", statuses: ["Verified", "Closed", "Deferred", "Rejected / out of scope", "Withdrawn"], dropStatus: "Closed" },
];

const staffNavigation = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "projects" as View, label: "Projects", icon: FolderKanban },
  { id: "releases" as View, label: "Releases", icon: PackageCheck },
  { id: "feedback" as View, label: "Feedback", icon: MessageSquareWarning },
  { id: "clients" as View, label: "Clients & access", icon: Building2 },
  { id: "reports" as View, label: "Reports", icon: BarChart3 },
  { id: "settings" as View, label: "Team & security", icon: Settings2 },
];

const clientNavigation = [
  { id: "releases" as View, label: "Current release", icon: PackageCheck },
  { id: "feedback" as View, label: "Feedback", icon: MessageSquareWarning },
  { id: "projects" as View, label: "Project details", icon: FolderKanban },
];

const clientAdminNavigation = { id: "clients" as View, label: "Team access", icon: Users };

function formatDate(value: string, includeYear = false) {
  if (!value) return "—";
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}) }).format(new Date(normalized));
}

function daysSince(value: string) {
  if (!value) return 0;
  const normalized = value.includes("T") || value.includes(" ") ? value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z") : `${value}T12:00:00Z`;
  const elapsed = Date.now() - new Date(normalized).getTime();
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86400000)) : 0;
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

function field(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function roleLabel(role: string) {
  return ({ agency_admin: "Agency admin", project_manager: "Project manager", developer: "Developer", client_admin: "Client admin", client_tester: "Client tester", client_viewer: "Client viewer" } as Record<string, string>)[role] || role;
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
  return {
    clients,
    projects,
    releases,
    tickets,
    checklist: data.checklist.filter((item) => releaseIds.has(item.release_id)),
    comments: data.comments.filter((comment) => ticketIds.has(comment.ticket_id) && comment.visibility === "public"),
    audit: data.audit.filter((event) => ticketIds.has(event.entity_id) || releaseIds.has(event.entity_id)),
    members: data.members.filter((member) => member.client_id === clientId),
    attachments: data.attachments.filter((attachment) => ticketIds.has(attachment.ticket_id)),
    templates: [],
    scope: data.scope.filter((version) => projectIds.has(version.project_id)),
    projectTeam: [],
    directory: [],
  };
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
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(null);
  const [teamProjectId, setTeamProjectId] = useState<string | null>(null);
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
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("dl-theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
    setView((current) => body.actor?.isStaff ? current : current === "overview" || current === "clients" || current === "reports" ? "releases" : current);
    setSelectedReleaseId((current) => current || body.workspace?.releases.find((item) => item.status === "Testing" || item.status === "Retest")?.id || body.workspace?.releases[0]?.id || null);
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
      if (event.key === "Escape") { setSelectedTicketId(null); setModal(null); return; }
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
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Action failed");
      await load();
      setModal(null);
      setPrefill(null);
      notify(success);
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
  const selectedRelease = data.releases.find((release) => release.id === selectedReleaseId) || data.releases[0];
  const selectedTicket = data.tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  const openTickets = data.tickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const blockers = openTickets.filter((ticket) => ticket.severity === "Critical" || ticket.severity === "High");
  const retest = data.tickets.filter((ticket) => ticket.status === "Ready for retest");
  const testingReleases = data.releases.filter((release) => ["Testing", "Retest"].includes(release.status));
  const canReport = actor.isStaff || ["client_admin", "client_tester"].includes(actor.role);
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
  const visibleTickets = data.tickets.filter((ticket) => {
    const project = data.projects.find((item) => item.id === ticket.project_id);
    const searchable = `${ticket.key} ${ticket.title} ${ticket.reporter} ${project?.name || ""}`.toLowerCase();
    if (myWork && ticket.assignee !== actor.name && ticket.reporter !== actor.name) return false;
    return searchable.includes(query.toLowerCase()) && (statusFilter === "All statuses" || ticket.status === statusFilter);
  });

  function changePreview(value: string) {
    const nextClientId = value || null;
    setPreviewClientId(nextClientId);
    setView(nextClientId ? "releases" : "overview");
    setSelectedTicketId(null);
    const release = nextClientId
      ? fullWorkspace.releases.find((item) => fullWorkspace.projects.find((project) => project.id === item.project_id)?.client_id === nextClientId && item.status !== "Approved")
      : fullWorkspace.releases.find((item) => ["Testing", "Retest"].includes(item.status));
    setSelectedReleaseId(release?.id || null);
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
                {item.id === "feedback" && openTickets.length ? <em>{openTickets.length}</em> : null}
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
            <span className="avatar">{initials(actor.name)}</span>
            <div><strong>{actor.name}</strong><small>{roleLabel(actor.role)}</small></div>
            <button className="account-signout" onClick={signOut} aria-label="Sign out" title="Sign out"><LockKeyhole size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p>{isClientView ? activeClient?.name || "Client workspace" : "Delivery operations"}</p>
            <h1>{pageTitle(view, isClientView)}</h1>
          </div>
          <div className="top-actions">
            {previewClientId ? <button className="quiet-button" onClick={() => changePreview("")}><X size={15} /> Exit preview</button> : null}
            {!isClientView && view === "projects" && canManageDelivery ? <button className="secondary-button" onClick={() => setModal("project")}><Plus size={15} /> New project</button> : null}
            {!isClientView && view === "clients" && canManageClients ? <button className="secondary-button" onClick={() => setModal("client")}><Plus size={15} /> New client</button> : null}
            {!isClientView && view === "releases" && canManageDelivery ? <button className="primary-button" onClick={() => setModal("release")}><Plus size={15} /> New release</button> : null}
            {!isClientView && view === "settings" && canManageClients ? <button className="secondary-button" onClick={() => openMemberModal("agency")}><UserPlus size={15} /> Add teammate</button> : null}
            {(view === "feedback" || isClientView) && canReport ? <button className="primary-button" onClick={() => setModal("feedback")}><Plus size={15} /> Report feedback</button> : null}
          </div>
        </header>

        {view === "overview" && !isClientView ? (
          <Overview data={data} openTickets={openTickets} blockers={blockers} retest={retest} testingReleases={testingReleases} setView={setView} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} setSelectedTicketId={setSelectedTicketId} setModal={setModal} />
        ) : null}
        {view === "projects" ? <Projects data={data} isClientView={isClientView} canManageDelivery={canManageDelivery && !isClientView} clientById={clientById} setView={setView} setSelectedReleaseId={setSelectedReleaseId} setScopeProjectId={setScopeProjectId} setTeamProjectId={setTeamProjectId} notify={notify} /> : null}
        {view === "releases" ? <Releases data={data} actor={actor} isClientView={isClientView} selectedRelease={selectedRelease} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} runAction={runAction} busy={busy} setPrintReleaseId={setPrintReleaseId} /> : null}
        {view === "feedback" ? <Feedback data={data} tickets={visibleTickets} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} setSelectedTicketId={setSelectedTicketId} boardMode={boardMode} setBoardMode={setBoardMode} myWork={myWork} setMyWork={setMyWork} unreadIds={unreadIds} visibleCount={visibleCount} setVisibleCount={setVisibleCount} isStaff={actor.isStaff && !previewClientId} runAction={runAction} /> : null}
        {view === "clients" && (!isClientView || canManageClientMembers) ? <Clients data={data} actor={actor} openMemberModal={openMemberModal} runAction={runAction} busy={busy} notify={notify} /> : null}
        {view === "reports" && !isClientView ? <Reports data={data} /> : null}
        {view === "settings" && !isClientView ? <Settings data={data} actor={actor} openMemberModal={openMemberModal} runAction={runAction} busy={busy} notify={notify} /> : null}
      </main>

      {selectedTicket ? (
        <FeedbackDrawer ticket={selectedTicket} actor={actor} project={projectById(selectedTicket.project_id)} release={releaseById(selectedTicket.release_id)} comments={data.comments.filter((comment) => comment.ticket_id === selectedTicket.id)} attachments={data.attachments.filter((attachment) => attachment.ticket_id === selectedTicket.id)} audit={data.audit.filter((event) => event.entity_id === selectedTicket.id)} siblingTickets={data.tickets.filter((item) => item.project_id === selectedTicket.project_id && item.id !== selectedTicket.id)} openTicketByKey={(key) => { const target = data.tickets.find((item) => item.key === key); if (target) setSelectedTicketId(target.id); }} assigneeOptions={(() => { const options = assigneesForProject(selectedTicket.project_id); return options.includes(selectedTicket.assignee) ? options : [...options, selectedTicket.assignee]; })()} templates={fullWorkspace.templates || []} mentionNames={[...new Set([...fullWorkspace.members.filter((member) => member.active === "1").map((member) => member.name), selectedTicket.reporter, selectedTicket.assignee])].filter((name) => name && name !== "Unassigned" && name !== actor.name)} isClientView={isClientView} canRespond={canReport} close={() => setSelectedTicketId(null)} runAction={runAction} busy={busy} notify={notify} />
      ) : null}
      {teamProjectId && projectById(teamProjectId) ? (
        <TeamModal project={projectById(teamProjectId)!} members={fullWorkspace.members} team={(fullWorkspace.projectTeam || []).filter((row) => row.project_id === teamProjectId)} actor={actor} close={() => setTeamProjectId(null)} runAction={runAction} busy={busy} />
      ) : null}
      {scopeProjectId && projectById(scopeProjectId) ? (
        <ScopePanel project={projectById(scopeProjectId)!} versions={(data.scope || []).filter((version) => version.project_id === scopeProjectId)} canEdit={["agency_admin", "project_manager", "client_admin"].includes(actor.role)} isClientView={isClientView} close={() => setScopeProjectId(null)} runAction={runAction} busy={busy} />
      ) : null}
      {modal ? (
        <ActionModal modal={modal} data={isClientView ? data : workspace} isClientView={isClientView} selectedRelease={selectedRelease} memberClientId={memberClientId} prefill={prefill} close={() => { setModal(null); setPrefill(null); }} runAction={runAction} busy={busy} notify={notify} />
      ) : null}
      {printRelease ? (
        <AcceptanceReport release={printRelease} project={projectById(printRelease.project_id)} client={clientById(projectById(printRelease.project_id)?.client_id || "")} checklist={data.checklist.filter((item) => item.release_id === printRelease.id)} tickets={data.tickets.filter((ticket) => ticket.release_id === printRelease.id)} audit={data.audit.filter((event) => event.entity_id === printRelease.id)} close={() => setPrintReleaseId(null)} />
      ) : null}
      {toast ? <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div> : null}
    </div>
  );
}

function pageTitle(view: View, isClientView: boolean) {
  if (isClientView) return ({ releases: "Release testing", feedback: "Feedback and retesting", projects: "Project details", overview: "Overview", clients: "Access", reports: "Reports", settings: "Settings" } as Record<View, string>)[view];
  return ({ overview: "Delivery overview", projects: "Projects", releases: "Release centre", feedback: "Feedback inbox", clients: "Clients and access", reports: "UAT reporting", settings: "Team and security" } as Record<View, string>)[view];
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-symbol large"><span /></span><div><strong>DeliveryLoop</strong><small>Preparing your workspace</small></div></main>;
}

function AccessScreen({ error }: { error: { status: number; message: string } }) {
  return <AuthScreen status={error.status} message={error.message} />;
}

function Overview({ data, openTickets, blockers, retest, testingReleases, setView, setSelectedReleaseId, projectById, clientById, setSelectedTicketId, setModal }: { data: Workspace; openTickets: Ticket[]; blockers: Ticket[]; retest: Ticket[]; testingReleases: Release[]; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; setSelectedTicketId: (id: string) => void; setModal: (modal: Modal) => void }) {
  const verified = data.tickets.filter((ticket) => closedStatuses.has(ticket.status)).length;
  if (!data.releases.length) {
    return <div className="page-content overview-page">
      <section className="onboarding surface">
        <header><p>Welcome to DeliveryLoop</p><h2>Set up your first client delivery loop</h2><small>Three quick steps and you can hand a release to a client for structured testing and sign-off.</small></header>
        <div className="onboarding-steps">
          <button onClick={() => setModal("client")}><span className={data.clients.length ? "step-num done" : "step-num"}>{data.clients.length ? <Check size={14} /> : "1"}</span><b>Create a client workspace</b><small>The company whose delivery you are running. Their testers will only ever see their own work.</small></button>
          <button disabled={!data.clients.length} onClick={() => setModal("project")}><span className={data.projects.length ? "step-num done" : "step-num"}>{data.projects.length ? <Check size={14} /> : "2"}</span><b>Add a project</b><small>What you are building for them — it gets a code like ACM that numbers every feedback ticket.</small></button>
          <button disabled={!data.projects.length} onClick={() => setModal("release")}><span className="step-num">3</span><b>Prepare a release</b><small>A build for the client to test, with the acceptance checklist they should work through.</small></button>
        </div>
        <p className="onboarding-hint"><ShieldCheck size={16} /> After that, invite the client&apos;s testers under Clients &amp; access — they report feedback, you fix, they verify, and finally sign the release off.</p>
      </section>
    </div>;
  }
  return <div className="page-content overview-page">
    <section className="summary-strip" aria-label="Delivery summary">
      <div><i className="metric-icon tone-brand"><PackageCheck size={16} /></i><span>Releases in UAT</span><strong>{testingReleases.length}</strong><small>{data.releases.length} releases tracked</small></div>
      <div><i className="metric-icon tone-danger"><MessageSquareWarning size={16} /></i><span>Open feedback</span><strong>{openTickets.length}</strong><small>{blockers.length} high-impact items</small></div>
      <div><i className="metric-icon tone-warning"><RefreshCcw size={16} /></i><span>Waiting on client</span><strong>{retest.length}</strong><small>Ready for retest</small></div>
      <div><i className="metric-icon tone-success"><CheckCircle2 size={16} /></i><span>Closed this cycle</span><strong>{verified}</strong><small>{data.tickets.length ? Math.round((verified / data.tickets.length) * 100) : 0}% completion</small></div>
    </section>

    <section className="content-grid">
      <article className="surface release-board">
        <header className="section-header"><div><p>Live delivery</p><h2>Release readiness</h2></div><button onClick={() => setView("releases")}>All releases <ArrowUpRight size={14} /></button></header>
        <div className="release-table">
          <div className="release-table-head"><span>Client and release</span><span>Acceptance</span><span>Open</span><span>Due</span><span /></div>
          {testingReleases.map((release) => {
            const project = projectById(release.project_id); const client = clientById(project?.client_id || "");
            const checks = data.checklist.filter((item) => item.release_id === release.id); const passed = checks.filter((item) => item.state === "Passed").length;
            const percent = checks.length ? Math.round((passed / checks.length) * 100) : 0;
            const open = data.tickets.filter((ticket) => ticket.release_id === release.id && !closedStatuses.has(ticket.status)).length;
            return <button key={release.id} onClick={() => { setSelectedReleaseId(release.id); setView("releases"); }}>
              <span className="release-name"><i style={{ background: client?.accent }}>{initials(client?.name || "CL")}</i><span><b>{project?.name}</b><small>{release.version} · {release.name}</small></span></span>
              <span className="progress-cell"><span><i style={{ width: `${percent}%` }} /></span><small>{percent}%</small></span>
              <span className={open ? "number-cell warning" : "number-cell"}>{open}</span>
              <span className="date-cell">{formatDate(release.due_date)}</span>
              <ChevronRight size={16} />
            </button>;
          })}
        </div>
      </article>

      <article className="surface attention-panel">
        <header className="section-header"><div><p>Priority queue</p><h2>Needs attention</h2></div><span className="count-badge">{blockers.length}</span></header>
        <div className="attention-list">
          {blockers.slice(0, 5).map((ticket) => <button key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)}><span className={`severity-marker ${ticket.severity.toLowerCase()}`} /><span><b>{ticket.title}</b><small>{ticket.key} · {ticket.status}</small></span><em>{ticket.severity}</em></button>)}
          {!blockers.length ? <div className="compact-empty"><CheckCircle2 size={20} /><span><b>No release blockers</b><small>Everything is moving normally.</small></span></div> : null}
        </div>
      </article>
    </section>

    <section className="content-grid lower">
      <article className="surface"><header className="section-header"><div><p>Latest reports</p><h2>Recent feedback</h2></div><button onClick={() => setView("feedback")}>Open inbox <ArrowUpRight size={14} /></button></header><FeedbackTable tickets={data.tickets.slice(0, 5)} projects={data.projects} onOpen={setSelectedTicketId} compact /></article>
      <article className="surface activity-panel"><header className="section-header"><div><p>Evidence trail</p><h2>Recent activity</h2></div><Activity size={17} /></header><div className="activity-list">{data.audit.slice(0, 5).map((event) => <div key={event.id}><span><CircleDotIcon /></span><p><b>{event.action}</b><small>{event.actor} · {event.details || formatDate(event.created_at)}</small></p></div>)}</div></article>
    </section>
  </div>;
}

function CircleDotIcon() {
  return <span className="activity-dot" />;
}

function Projects({ data, isClientView, canManageDelivery, clientById, setView, setSelectedReleaseId, setScopeProjectId, setTeamProjectId, notify }: { data: Workspace; isClientView: boolean; canManageDelivery: boolean; clientById: (id: string) => Client | undefined; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void; setScopeProjectId: (id: string) => void; setTeamProjectId: (id: string) => void; notify: (message: string) => void }) {
  const memberNameById = new Map(data.members.map((member) => [member.id, member.name]));
  async function copyBookmarklet(projectName: string) {
    const origin = window.location.origin;
    const bookmarklet = `javascript:(function(){var u=encodeURIComponent(location.href);var v=encodeURIComponent(innerWidth+' x '+innerHeight);window.open('${origin}/?report=1&url='+u+'&vw='+v,'_blank');})();`;
    try {
      await navigator.clipboard.writeText(bookmarklet);
      notify(`Capture bookmarklet copied for ${projectName}. Save it as a browser bookmark and click it on any staging page.`);
    } catch {
      notify("Could not copy the bookmarklet to the clipboard");
    }
  }
  return <div className="page-content"><div className="project-list">{data.projects.map((project) => {
    const client = clientById(project.client_id); const releases = data.releases.filter((release) => release.project_id === project.id); const tickets = data.tickets.filter((ticket) => ticket.project_id === project.id); const current = releases.find((release) => release.status !== "Approved") || releases[0];
    const scopeVersion = (data.scope || []).filter((version) => version.project_id === project.id).length;
    const teamNames = (data.projectTeam || []).filter((row) => row.project_id === project.id).map((row) => memberNameById.get(row.member_id)).filter((name): name is string => Boolean(name));
    return <article className="project-row-card" key={project.id}><div className="project-identity"><span style={{ background: client?.accent }}>{project.code}</span><div><p>{client?.name}</p><h2>{project.name}</h2><small>{project.description}</small></div></div><dl><div><dt>Lead</dt><dd>{project.manager}</dd></div><div><dt>Stage</dt><dd><StatusBadge value={project.stage} /></dd></div><div><dt>Open feedback</dt><dd>{tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length}</dd></div><div><dt>Current release</dt><dd>{current?.version || "—"}</dd></div></dl>{!isClientView ? <div className="project-team-row"><span className="project-team-label"><Users size={13} /> Team</span>{teamNames.length ? teamNames.map((name) => <span key={name} className="team-chip" title={name}><b>{initials(name)}</b><i>{name}</i></span>) : <span className="team-open-note">Open to all teammates</span>}{canManageDelivery ? <button className="quiet-button" onClick={() => setTeamProjectId(project.id)}><UserPlus size={13} /> Manage team</button> : null}</div> : null}<div className="row-actions"><button className="quiet-button" title="Agreed scope of work with full version history" onClick={() => setScopeProjectId(project.id)}><FileText size={14} /> Scope of work{scopeVersion ? <em className="scope-version-chip">v{scopeVersion}</em> : null}</button><button className="quiet-button" title="Copy a bookmarklet that opens a prefilled feedback form from any staging page" onClick={() => copyBookmarklet(project.name)}><Copy size={14} /> Capture tool</button>{project.staging_url ? <a href={project.staging_url} target="_blank" rel="noreferrer" className="quiet-button">Staging <ExternalLink size={14} /></a> : null}{current ? <button className="secondary-button" onClick={() => { setSelectedReleaseId(current.id); setView("releases"); }}>View release <ChevronRight size={14} /></button> : null}</div>{isClientView ? <span className="client-access-note"><ShieldCheck size={14} /> Your organisation only</span> : null}</article>;
  })}</div>
  {!isClientView && data.directory?.length ? <section className="project-directory">
    <header className="section-header"><div><p>Rest of the agency</p><h2>Other projects in progress</h2></div></header>
    <div className="directory-grid">
      {data.directory.map((project) => <article key={project.id} className="directory-card">
        <div className="directory-top"><span className="directory-code">{project.code}</span><StatusBadge value={project.stage} /></div>
        <h3>{project.name}</h3>
        <p>{clientById(project.client_id)?.name || "Agency client"} · led by {project.manager}</p>
        <div className="directory-team">{project.team.length ? project.team.map((name) => <span key={name} className="team-chip" title={name}><b>{initials(name)}</b><i>{name}</i></span>) : <span className="team-open-note">Team not listed</span>}</div>
        <span className="directory-lock"><LockKeyhole size={12} /> Overview only — you are not on this project&apos;s team</span>
      </article>)}
    </div>
  </section> : null}
  </div>;
}

function Releases({ data, actor, isClientView, selectedRelease, setSelectedReleaseId, projectById, clientById, runAction, busy, setPrintReleaseId }: { data: Workspace; actor: Actor; isClientView: boolean; selectedRelease?: Release; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; runAction: RunAction; busy: boolean; setPrintReleaseId: (id: string | null) => void }) {
  const [exceptions, setExceptions] = useState("");
  if (!selectedRelease) return <div className="page-content"><EmptyState icon={PackageCheck} title="No releases yet" body={isClientView ? "Your delivery team has not opened a release for testing yet. You will be notified when one is ready." : "Create the first release to begin client UAT."} /></div>;
  const project = projectById(selectedRelease.project_id); const client = clientById(project?.client_id || "");
  const checks = data.checklist.filter((item) => item.release_id === selectedRelease.id);
  const releaseTickets = data.tickets.filter((ticket) => ticket.release_id === selectedRelease.id);
  const open = releaseTickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const blockers = open.filter((ticket) => ["Critical", "High"].includes(ticket.severity));
  const incomplete = checks.filter((item) => item.state !== "Passed");
  const canApprove = blockers.length === 0 && incomplete.length === 0 && selectedRelease.status !== "Approved";
  const canSign = ["agency_admin", "project_manager", "client_admin"].includes(actor.role);
  const canTest = actor.isStaff || ["client_admin", "client_tester"].includes(actor.role);
  const approvalEvent = data.audit.find((event) => event.entity_id === selectedRelease.id && event.action === "Release approved");
  const cycle = (state: string) => state === "Not tested" ? "Passed" : state === "Passed" ? "Failed" : "Not tested";
  function toggleCheck(item: ChecklistItem) {
    const next = cycle(item.state);
    void runAction("updateChecklist", { itemId: item.id, state: next }, `Updated “${item.title}”`, (workspace) => ({
      ...workspace,
      checklist: workspace.checklist.map((entry) => entry.id === item.id ? { ...entry, state: next } : entry),
    }));
  }
  return <div className="page-content release-page">
    <aside className="release-index"><p>Release history</p>{data.releases.map((release) => <button key={release.id} className={release.id === selectedRelease.id ? "active" : ""} onClick={() => setSelectedReleaseId(release.id)}><span className={`release-dot ${release.status.toLowerCase()}`} /><span><b>{release.version}</b><small>{release.name}</small></span><time>{formatDate(release.due_date)}</time></button>)}</aside>
    <section className="release-content">
      <article className="release-summary surface"><div className="release-summary-top"><div className="release-title"><span style={{ background: client?.accent }}>{initials(client?.name || "CL")}</span><div><p>{client?.name} / {project?.name}</p><h2>{selectedRelease.name}</h2><small>{selectedRelease.version} · {selectedRelease.build}</small></div></div><span className="release-summary-actions"><button className="quiet-button" onClick={() => setPrintReleaseId(selectedRelease.id)}><Printer size={15} /> Acceptance report</button><StatusBadge value={selectedRelease.status} /></span></div><p className="release-brief">{selectedRelease.testing_notes}</p><dl><div><CalendarDays size={16} /><span><dt>Testing window</dt><dd>{formatDate(selectedRelease.start_date)} – {formatDate(selectedRelease.due_date, true)}</dd></span></div><div><Inbox size={16} /><span><dt>Feedback</dt><dd>{open.length} open / {releaseTickets.length} total</dd></span></div><div><AlertTriangle size={16} /><span><dt>Blocking</dt><dd className={blockers.length ? "danger-text" : "success-text"}>{blockers.length || "Clear"}</dd></span></div></dl></article>
      <div className="release-workspace">
        <article className="surface checklist-panel"><header className="section-header"><div><p>Acceptance scope</p><h2>UAT checklist</h2></div><span className="fraction">{checks.filter((item) => item.state === "Passed").length} / {checks.length}</span></header><div className="checklist-list">{checks.map((item) => <button key={item.id} disabled={busy || selectedRelease.status === "Approved" || !canTest} onClick={() => toggleCheck(item)}><span className={`check-box ${item.state.toLowerCase().replace(" ", "-")}`}>{item.state === "Passed" ? <Check size={14} /> : item.state === "Failed" ? <X size={14} /> : null}</span><span><b>{item.title}</b><small>{item.state}</small></span></button>)}</div></article>
        <article className="surface approval-panel"><header className="section-header"><div><p>Delivery gate</p><h2>{selectedRelease.status === "Approved" ? "Release accepted" : "Client sign-off"}</h2></div><ShieldCheck size={18} /></header>{selectedRelease.status === "Approved" ? <div className="approved-state"><CheckCircle2 size={28} /><h3>Accepted by {selectedRelease.approved_by}</h3><p>{formatDate(selectedRelease.approved_at || "", true)}</p>{approvalEvent?.details && approvalEvent.details !== "No exceptions" ? <span className="approved-exceptions"><b>Recorded exceptions</b>{approvalEvent.details}</span> : null}<small>The immutable audit event has been recorded.</small></div> : <><div className="gate-list"><GateRow passed={!blockers.length} title="No open blockers" detail={blockers.length ? `${blockers.length} high-impact items remain` : "Requirement met"} /><GateRow passed={!incomplete.length} title="Checklist complete" detail={incomplete.length ? `${incomplete.length} checks are not passed` : "Requirement met"} /><GateRow passed={canSign} title="Authorised approver" detail={canSign ? roleLabel(actor.role) : "Client admin approval required"} /></div>{canApprove && canSign ? <label className="exceptions-field">Exceptions to record (optional)<textarea value={exceptions} maxLength={1000} onChange={(event) => setExceptions(event.target.value)} placeholder="Agreed items that ship despite being open, e.g. deferred content fixes" /></label> : null}<button className="primary-button full" disabled={!canApprove || !canSign || busy} onClick={() => runAction("approveRelease", { releaseId: selectedRelease.id, exceptions: exceptions.trim() }, "Release approved and recorded")}>{canApprove && canSign ? "Approve release" : "Complete the gates above"}</button><p className="approval-note">Approval captures the release build, approver, timestamp and any recorded exceptions.</p></>}</article>
      </div>
      {isClientView ? <div className="client-help"><ShieldCheck size={17} /><span><b>You are reviewing your organisation’s release.</b><small>Internal delivery notes and other client workspaces are hidden.</small></span></div> : null}
    </section>
  </div>;
}

function AcceptanceReport({ release, project, client, checklist, tickets, audit, close }: { release: Release; project?: Project; client?: Client; checklist: ChecklistItem[]; tickets: Ticket[]; audit: AuditEvent[]; close: () => void }) {
  const open = tickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const resolved = tickets.filter((ticket) => closedStatuses.has(ticket.status));
  const approvalEvent = audit.find((event) => event.action === "Release approved");
  return <div className="print-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="print-sheet" role="dialog" aria-modal="true" aria-label="Acceptance report">
      <header className="print-toolbar no-print">
        <p>Preview of the acceptance evidence document</p>
        <span><button className="secondary-button" onClick={close}><X size={15} /> Close</button><button className="primary-button" onClick={() => window.print()}><Printer size={15} /> Print or save PDF</button></span>
      </header>
      <div className="print-body">
        <header className="print-head">
          <div><p>UAT acceptance report</p><h1>{project?.name}</h1><small>{client?.name} · Prepared {formatDate(new Date().toISOString(), true)}</small></div>
          <span className="print-brand">DeliveryLoop</span>
        </header>
        <dl className="print-facts">
          <div><dt>Release</dt><dd>{release.name}</dd></div>
          <div><dt>Version / build</dt><dd>{release.version} · {release.build}</dd></div>
          <div><dt>Testing window</dt><dd>{formatDate(release.start_date, true)} – {formatDate(release.due_date, true)}</dd></div>
          <div><dt>Status</dt><dd>{release.status}{release.approved_by ? ` by ${release.approved_by} on ${formatDate(release.approved_at || "", true)}` : ""}</dd></div>
          {approvalEvent ? <div className="span-2"><dt>Recorded exceptions</dt><dd>{approvalEvent.details || "No exceptions"}</dd></div> : null}
        </dl>
        <h2>Acceptance checklist</h2>
        <table><thead><tr><th>Acceptance flow</th><th>Result</th></tr></thead><tbody>
          {checklist.map((item) => <tr key={item.id}><td>{item.title}</td><td className={item.state === "Passed" ? "pass" : item.state === "Failed" ? "fail" : ""}>{item.state}</td></tr>)}
          {!checklist.length ? <tr><td colSpan={2}>No checklist items were defined.</td></tr> : null}
        </tbody></table>
        <h2>Feedback summary</h2>
        <table><thead><tr><th>Key</th><th>Title</th><th>Type</th><th>Severity</th><th>Status</th></tr></thead><tbody>
          {tickets.map((ticket) => <tr key={ticket.id}><td>{ticket.key}</td><td>{ticket.title}</td><td>{ticket.type}</td><td>{ticket.severity}</td><td>{ticket.status}</td></tr>)}
          {!tickets.length ? <tr><td colSpan={5}>No feedback was reported for this release.</td></tr> : null}
        </tbody></table>
        <p className="print-summary">{resolved.length} of {tickets.length} feedback items resolved · {open.length} open at time of report.</p>
        <footer className="print-footer">Generated by DeliveryLoop. Approval events are recorded with the approver identity and timestamp in the immutable audit log.</footer>
      </div>
    </section>
  </div>;
}

function GateRow({ passed, title, detail }: { passed: boolean; title: string; detail: string }) {
  return <div><span className={passed ? "pass" : "block"}>{passed ? <Check size={13} /> : <AlertCircle size={13} />}</span><p><b>{title}</b><small>{detail}</small></p></div>;
}

function Feedback({ data, tickets, query, setQuery, statusFilter, setStatusFilter, setSelectedTicketId, boardMode, setBoardMode, myWork, setMyWork, unreadIds, visibleCount, setVisibleCount, isStaff, runAction }: { data: Workspace; tickets: Ticket[]; query: string; setQuery: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; setSelectedTicketId: (id: string) => void; boardMode: boolean; setBoardMode: (value: boolean) => void; myWork: boolean; setMyWork: (value: boolean) => void; unreadIds: Set<string>; visibleCount: number; setVisibleCount: (value: number) => void; isStaff: boolean; runAction: RunAction }) {
  const paged = tickets.slice(0, visibleCount);
  return <div className="page-content feedback-page">
    <div className="filter-row">
      <label className="search-box"><Search size={16} /><input aria-label="Search feedback" placeholder="Search feedback, project or reporter  ( / )" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="filter-select"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button className={`mywork-toggle ${myWork ? "active" : ""}`} onClick={() => setMyWork(!myWork)} aria-pressed={myWork}><UserCheck size={14} /> My work</button>
      <div className="view-toggle" role="group" aria-label="Layout">
        <button className={boardMode ? "" : "active"} onClick={() => setBoardMode(false)}>List</button>
        <button className={boardMode ? "active" : ""} onClick={() => setBoardMode(true)}>Board</button>
      </div>
      <span className="result-count">{tickets.length} results</span>
    </div>
    {boardMode ? (
      <FeedbackBoard tickets={tickets} onOpen={setSelectedTicketId} isStaff={isStaff} unreadIds={unreadIds} runAction={runAction} />
    ) : (
      <article className="surface feedback-surface">
        <FeedbackTable tickets={paged} projects={data.projects} onOpen={setSelectedTicketId} unreadIds={unreadIds} />
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
            const Icon = feedbackIcons[ticket.type] || MessageCircleQuestion;
            return <button key={ticket.id} className="board-card" draggable={isStaff}
              onDragStart={(event) => event.dataTransfer.setData("text/deliveryloop-ticket", ticket.id)}
              onClick={() => onOpen(ticket.id)}>
              <span className="board-card-top"><i className={`feedback-type ${ticket.type.toLowerCase().replace(" ", "-")}`}><Icon size={14} /></i><small>{ticket.key}</small>{unreadIds?.has(ticket.id) ? <i className="unread-dot" title="New activity" /> : null}<em className={`severity-flag ${ticket.severity.toLowerCase()}`} title={`${ticket.severity} severity`}>{ticket.severity}</em><em className={`priority-label ${ticket.priority.toLowerCase()}`}>{ticket.priority}</em></span>
              <b>{ticket.title}</b>
              <span className="board-card-meta"><StatusBadge value={ticket.status} />{chip ? <SlaChip chip={chip} /> : null}<span className={`board-assignee ${ticket.assignee === "Unassigned" ? "empty" : ""}`} title={ticket.assignee === "Unassigned" ? "Unassigned — open the card to assign" : `Assigned to ${ticket.assignee}`}>{ticket.assignee === "Unassigned" ? "?" : initials(ticket.assignee)}</span></span>
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

function FeedbackTable({ tickets, projects, onOpen, unreadIds, compact = false }: { tickets: Ticket[]; projects: Project[]; onOpen: (id: string) => void; unreadIds?: Set<string>; compact?: boolean }) {
  return <div className={`feedback-table ${compact ? "compact" : ""}`}><div className="feedback-head"><span>Feedback</span><span>Project</span><span>Status</span><span>Priority</span><span>Owner</span></div>{tickets.length ? tickets.map((ticket) => {
    const project = projects.find((item) => item.id === ticket.project_id); const Icon = feedbackIcons[ticket.type] || MessageCircleQuestion;
    const chip = compact ? null : slaChip(ticket);
    return <button className="feedback-row" key={ticket.id} onClick={() => onOpen(ticket.id)}><span className="feedback-title"><i className={`feedback-type ${ticket.type.toLowerCase().replace(" ", "-")}`}><Icon size={15} /></i><span><b>{ticket.title}{unreadIds?.has(ticket.id) ? <i className="unread-dot" title="New activity" /> : null}</b><small>{ticket.key} · {ticket.reporter}</small></span></span><span className="project-reference"><b>{project?.code}</b><small>{project?.name}</small></span><span className="status-cell"><StatusBadge value={ticket.status} />{chip ? <SlaChip chip={chip} /> : null}</span><span className={`priority-label ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span><span className="owner-cell"><i>{initials(ticket.assignee)}</i>{ticket.assignee}</span></button>;
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
  </div>;
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
    const form = new FormData(event.currentTarget);
    const currentPassword = field(form, "currentPassword");
    const newPassword = field(form, "newPassword");
    const confirmPassword = field(form, "confirmPassword");
    if (newPassword !== confirmPassword) return notify("New passwords do not match");
    setSaving(true);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setSaving(false);
    if (result.error) return notify(result.error.message || "Password could not be changed");
    event.currentTarget.reset();
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
        <span className="member-person"><i>{initials(member.name)}</i><span><b>{member.name}{isSelf ? <em>You</em> : null}</b><small>{member.email}</small></span></span>
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
  function exportCsv() { const rows = [["Key", "Title", "Type", "Severity", "Priority", "Status", "Reporter", "Assignee"], ...data.tickets.map((ticket) => [ticket.key, ticket.title, ticket.type, ticket.severity, ticket.priority, ticket.status, ticket.reporter, ticket.assignee])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "deliveryloop-uat-report.csv"; link.click(); URL.revokeObjectURL(url); }
  return <div className="page-content report-page"><div className="report-actions"><p>Portfolio-wide UAT performance and delivery evidence.</p><button className="secondary-button" onClick={exportCsv}><Download size={15} /> Export CSV</button></div><div className="report-grid"><article className="surface completion-panel"><header className="section-header"><div><p>Portfolio health</p><h2>UAT completion</h2></div><span>{completion}%</span></header><div className="completion-body"><div className="completion-meter"><i style={{ width: `${completion}%` }} /></div><dl><div><dt>Feedback captured</dt><dd>{total}</dd></div><div><dt>Verified or closed</dt><dd>{complete}</dd></div><div><dt>Open blockers</dt><dd>{data.tickets.filter((ticket) => !closedStatuses.has(ticket.status) && ["Critical", "High"].includes(ticket.severity)).length}</dd></div></dl></div></article><article className="surface type-panel"><header className="section-header"><div><p>Scope clarity</p><h2>Feedback by type</h2></div></header><div className="type-bars">{types.map((type) => { const count = data.tickets.filter((ticket) => ticket.type === type).length; return <div key={type}><span><b>{type}</b><em>{count}</em></span><i><u style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></i></div>; })}</div></article></div><article className="surface audit-panel"><header className="section-header"><div><p>Evidence</p><h2>Acceptance trail</h2></div><FileText size={17} /></header><div className="audit-table"><div className="audit-head"><span>Event</span><span>Actor</span><span>Details</span><span>Date</span></div>{data.audit.map((event) => <div key={event.id}><b>{event.action}</b><span>{event.actor}</span><span>{event.details || "—"}</span><time>{formatDate(event.created_at, true)}</time></div>)}</div></article></div>;
}

function FeedbackDrawer({ ticket, actor, project, release, comments, attachments, audit, siblingTickets, openTicketByKey, assigneeOptions, templates, mentionNames, isClientView, canRespond, close, runAction, busy, notify }: { ticket: Ticket; actor: Actor; project?: Project; release?: Release; comments: Comment[]; attachments: Attachment[]; audit: AuditEvent[]; siblingTickets: Ticket[]; openTicketByKey: (key: string) => void; assigneeOptions: string[]; templates: ReplyTemplate[]; mentionNames: string[]; isClientView: boolean; canRespond: boolean; close: () => void; runAction: RunAction; busy: boolean; notify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [duplicatePicker, setDuplicatePicker] = useState(false);
  const [replyBody, setReplyBody] = useState("");
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
      type: field(form, "type"),
      severity: field(form, "severity"),
      title: field(form, "title"),
      actual: field(form, "actual"),
      expected: field(form, "expected"),
      pageUrl: field(form, "pageUrl"),
    }, "Feedback updated");
    setEditing(false);
  }

  function withdraw() {
    if (!window.confirm(`Withdraw ${ticket.key}? It will be closed and the other side will be notified.`)) return;
    void runAction("withdrawTicket", { ticketId: ticket.id }, "Feedback withdrawn");
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="feedback-drawer">
    <header>
      <div><p>{ticket.key} · {project?.name}</p><h2>{ticket.title}</h2></div>
      <span className="drawer-header-actions">
        {canEdit && !editing ? <button onClick={() => setEditing(true)} aria-label="Edit feedback" title="Edit feedback"><Pencil size={16} /></button> : null}
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
          <label>Feedback type<select name="type" defaultValue={ticket.type}><option>Bug</option><option>Change request</option><option>Content</option><option>Question</option></select></label>
          <label>Severity<select name="severity" defaultValue={ticket.severity}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label className="span-2">Title<input name="title" defaultValue={ticket.title} required maxLength={180} /></label>
          <label className="span-2">What happened?<textarea name="actual" defaultValue={ticket.actual} required /></label>
          <label className="span-2">What was expected?<textarea name="expected" defaultValue={ticket.expected} required /></label>
          <label className="span-2">Page or screen<input name="pageUrl" defaultValue={ticket.page_url} /></label>
          <footer className="span-2"><button type="button" className="quiet-button" onClick={() => setEditing(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></footer>
        </form>
      ) : (
        <section className="problem-card"><div><span>Observed</span><p>{ticket.actual}</p></div><div><span>Expected</span><p>{ticket.expected}</p></div></section>
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
      <section className="context-panel"><header><MonitorSmartphone size={15} /> Captured context</header><dl><div><dt>Page</dt><dd>{ticket.page_url || "Not supplied"}</dd></div><div><dt>Browser</dt><dd>{ticket.browser || "Not supplied"}</dd></div><div><dt>Viewport</dt><dd>{ticket.viewport || "Not supplied"}</dd></div><div><dt>Reporter</dt><dd>{ticket.reporter}</dd></div></dl></section>
      {isClientView && canRespond && ticket.status === "Ready for retest" ? <section className="retest-panel"><div><RefreshCcw size={18} /><span><b>A fix is ready to test</b><small>Confirm the result in {release?.build}.</small></span></div><footer><button className="secondary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Reopened" }, "Feedback reopened")}>Still broken</button><button className="primary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Verified" }, "Fix verified")}>Verify fix</button></footer></section> : null}
      {timeline.length ? <section className="ticket-timeline">
        <header><Activity size={14} /> History</header>
        <div>{timeline.map((event) => <div key={event.id} className="timeline-row"><span className="timeline-dot" /><p><b>{event.action}</b>{event.details ? <>· {event.details}</> : null}<small>{event.actor} · {formatDate(event.created_at, true)}</small></p></div>)}</div>
      </section> : null}
      <section className="conversation">
        <header><div><p>Conversation</p><h3>{visibleComments.length} updates</h3></div></header>
        {visibleComments.map((comment) => {
          const attachment = commentAttachment(comment.id);
          return <div className={`comment ${comment.visibility}`} key={comment.id}><span className="avatar small">{initials(comment.author)}</span><div><p><b>{comment.author}</b>{comment.visibility === "internal" ? <em>Internal</em> : null}<time>{formatDate(comment.created_at)}</time></p><div>{comment.body}</div>{attachment ? <a className="attachment-link small" href={`/api/uploads/${encodeURIComponent(attachment.key)}`} target="_blank" rel="noreferrer"><Paperclip size={13} /> Attached screenshot <ExternalLink size={12} /></a> : null}</div></div>;
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
              <span className="team-member-avatar">{initials(member.name)}</span>
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
          <label>Scope of work<textarea value={draft} maxLength={20000} onChange={(event) => setDraft(event.target.value)} placeholder={"Deliverables\n- What will be built\n\nOut of scope\n- What is explicitly excluded"} /></label>
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

function ActionModal({ modal, data, isClientView, selectedRelease, memberClientId, prefill, close, runAction, busy, notify }: { modal: Exclude<Modal, null>; data: Workspace; isClientView: boolean; selectedRelease?: Release; memberClientId: string | null; prefill: ReportPrefill | null; close: () => void; runAction: RunAction; busy: boolean; notify: (message: string) => void }) {
  const isAgencyMember = modal === "member" && memberClientId === "agency";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      if (modal === "client") return runAction("createClient", { name: field(form, "name"), contactName: field(form, "contactName"), contactEmail: field(form, "contactEmail"), accent: field(form, "accent") }, "Client workspace created");
      if (modal === "member") return runAction("createMember", { clientId: isAgencyMember ? "" : memberClientId || field(form, "clientId"), name: field(form, "name"), email: field(form, "email"), role: field(form, "role") }, "Member access created");
      if (modal === "project") return runAction("createProject", { clientId: field(form, "clientId"), name: field(form, "name"), code: field(form, "code"), description: field(form, "description"), manager: field(form, "manager"), stage: "UAT", stagingUrl: field(form, "stagingUrl") }, "Project created");
      if (modal === "release") return runAction("createRelease", { projectId: field(form, "projectId"), name: field(form, "name"), version: field(form, "version"), build: field(form, "build"), startDate: field(form, "startDate"), dueDate: field(form, "dueDate"), testingNotes: field(form, "testingNotes"), checklist: field(form, "checklist").split("\n").filter(Boolean) }, "Release prepared");
      const files = form.getAll("screenshot").filter((entry): entry is File => entry instanceof File && entry.size > 0).slice(0, 3);
      const attachmentKeys: string[] = [];
      for (const file of files) {
        const uploadData = new FormData(); uploadData.append("file", file);
        const upload = await fetch("/api/uploads", { method: "POST", body: uploadData });
        const body = await upload.json() as { key?: string; error?: string };
        if (!upload.ok || !body.key) throw new Error(body.error || "Screenshot upload failed");
        attachmentKeys.push(body.key);
      }
      const releaseId = field(form, "releaseId") || selectedRelease?.id || data.releases[0]?.id; const release = data.releases.find((item) => item.id === releaseId);
      if (!release) throw new Error("Choose a release before reporting feedback");
      await runAction("createTicket", { projectId: release.project_id, releaseId, type: field(form, "type"), title: field(form, "title"), actual: field(form, "actual"), expected: field(form, "expected"), severity: field(form, "severity"), pageUrl: field(form, "pageUrl"), browser: navigator.userAgent, viewport: prefill?.viewport || `${window.innerWidth} x ${window.innerHeight}`, build: release.build, attachmentKeys }, "Feedback submitted");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save");
    }
  }
  const title = modal === "member" && isAgencyMember ? "Add internal teammate" : ({ feedback: "Report feedback", project: "Create project", release: "Prepare release", client: "Create client workspace", member: "Invite workspace member" } as Record<Exclude<Modal, null>, string>)[modal];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><p>DeliveryLoop</p><h2>{title}</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header><form onSubmit={submit}>
    {modal === "feedback" ? <><label className="span-2">Release<select name="releaseId" defaultValue={selectedRelease?.id || data.releases[0]?.id}>{data.releases.map((release) => <option key={release.id} value={release.id}>{data.projects.find((project) => project.id === release.project_id)?.name} · {release.version}</option>)}</select></label><label>Feedback type<select name="type" defaultValue="Bug"><option>Bug</option><option>Change request</option><option>Content</option><option>Question</option></select></label><label>Severity<select name="severity" defaultValue="Medium"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><label className="span-2">Short title<input name="title" placeholder="Describe the issue clearly" required /></label><label className="span-2">What happened?<textarea name="actual" placeholder="What did you see and how did you get here?" required /></label><label className="span-2">What did you expect?<textarea name="expected" placeholder="Describe the expected result" required /></label><label className="span-2">Page or screen<input name="pageUrl" defaultValue={prefill?.pageUrl || ""} placeholder="/checkout/payment or a staging URL" /></label><label className="span-2 upload-field"><UploadCloud size={18} /><span><b>Attach screenshots</b><small>Up to 3 images · PNG, JPG, WebP or GIF, 8 MB each</small></span><input name="screenshot" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" /></label>{prefill?.pageUrl ? <div className="modal-callout span-2"><MonitorSmartphone size={16} /><span>Captured from the staging page{prefill.viewport ? ` at ${prefill.viewport}` : ""}. Check the details and submit.</span></div> : null}</> : null}
    {modal === "client" ? <><label className="span-2">Company name<input name="name" required placeholder="Acme Limited" /></label><label>Primary contact<input name="contactName" required placeholder="Contact name" /></label><label>Email<input name="contactEmail" type="email" required placeholder="client@company.com" /></label><label className="span-2">Workspace colour<input name="accent" type="color" defaultValue="#3157D5" /></label></> : null}
    {modal === "member" ? <><div className="modal-callout span-2"><ShieldCheck size={17} /><span>An activation email is sent to this exact address. Registration is invitation-only.</span></div>{!isAgencyMember ? <label className="span-2">Client<select name="clientId" defaultValue={memberClientId || ""} disabled={Boolean(memberClientId)}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label> : null}<label>Name<input name="name" required maxLength={120} placeholder="Full name" /></label><label>Email<input name="email" type="email" required maxLength={254} placeholder={isAgencyMember ? "person@agency.com" : "person@client.com"} /></label><label className="span-2">Role<select name="role" defaultValue={isAgencyMember ? "project_manager" : "client_tester"}>{isAgencyMember ? <><option value="agency_admin">Agency admin</option><option value="project_manager">Project manager</option><option value="developer">Developer</option></> : <><option value="client_admin">Client admin</option><option value="client_tester">Client tester</option><option value="client_viewer">Client viewer</option></>}</select></label></> : null}
    {modal === "project" ? <><label className="span-2">Client<select name="clientId">{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Project name<input name="name" required placeholder="Customer portal" /></label><label>Project code<input name="code" required maxLength={8} placeholder="CPT" /></label><label className="span-2">Purpose<textarea name="description" required placeholder="What is being delivered?" /></label><label>Project lead<input name="manager" required placeholder="Team member" /></label><label>Staging URL<input name="stagingUrl" type="url" placeholder="https://staging.example.com" /></label></> : null}
    {modal === "release" ? <><label className="span-2">Project<select name="projectId">{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="span-2">Release name<input name="name" required placeholder="Checkout and promotions UAT" /></label><label>Version<input name="version" required placeholder="v1.0" /></label><label>Build<input name="build" required placeholder="build-001" /></label><label>Testing starts<input name="startDate" type="date" required /></label><label>Testing due<input name="dueDate" type="date" required /></label><label className="span-2">Testing instructions<textarea name="testingNotes" required placeholder="What should the client focus on?" /></label><label className="span-2">Acceptance checklist<textarea name="checklist" required placeholder={"One acceptance flow per line\nGuest checkout\nPayment recovery\nEmail confirmation"} /></label></> : null}
    <footer><button type="button" className="quiet-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : isClientView && modal === "feedback" ? "Submit to delivery team" : "Save"}</button></footer>
  </form></section></div>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase().replaceAll(" ", "-").replaceAll("/", "-")}`}><i />{value}</span>;
}

function TypeBadge({ value }: { value: string }) {
  const Icon = feedbackIcons[value] || MessageCircleQuestion;
  return <span className="type-badge"><Icon size={13} />{value}</span>;
}

function SeverityBadge({ value }: { value: string }) {
  return <span className={`severity-badge ${value.toLowerCase()}`}><i />{value} severity</span>;
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Inbox; title: string; body: string }) {
  return <div className="empty-state"><Icon size={24} /><h3>{title}</h3><p>{body}</p></div>;
}
