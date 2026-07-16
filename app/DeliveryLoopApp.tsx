"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  Circle,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  MessageCircleQuestion,
  MessageSquareWarning,
  MonitorSmartphone,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Type,
  UploadCloud,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type Client = { id: string; name: string; contact_name: string; contact_email: string; accent: string; created_at: string };
type Member = { id: string; email: string; name: string; role: string; client_id: string | null; active: string; created_at: string };
type Project = { id: string; client_id: string; name: string; code: string; description: string; manager: string; stage: string; staging_url: string; created_at: string };
type Release = { id: string; project_id: string; name: string; version: string; build: string; status: string; start_date: string; due_date: string; testing_notes: string; approved_at: string | null; approved_by: string | null; created_at: string };
type ChecklistItem = { id: string; release_id: string; title: string; state: string; created_at: string };
type Ticket = { id: string; key: string; project_id: string; release_id: string; type: string; title: string; actual: string; expected: string; severity: string; priority: string; status: string; reporter: string; assignee: string; page_url: string; browser: string; viewport: string; build: string; attachment_key: string | null; created_at: string; updated_at: string };
type Comment = { id: string; ticket_id: string; author: string; body: string; visibility: string; created_at: string };
type AuditEvent = { id: string; entity_type: string; entity_id: string; action: string; actor: string; details: string; created_at: string };
type Actor = { id: string; email: string; name: string; role: string; clientId: string | null; isStaff: boolean };
type Workspace = { clients: Client[]; members: Member[]; projects: Project[]; releases: Release[]; checklist: ChecklistItem[]; tickets: Ticket[]; comments: Comment[]; audit: AuditEvent[] };
type View = "overview" | "projects" | "releases" | "feedback" | "clients" | "reports";
type Modal = "feedback" | "project" | "release" | "client" | "member" | null;
type ActionPayload = Record<string, string | string[]>;

const closedStatuses = new Set(["Verified", "Closed", "Deferred", "Rejected / out of scope"]);
const statusOptions = ["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Verified", "Closed", "Deferred", "Rejected / out of scope"];
const people = ["Unassigned", "Aarav Patel", "Neha Kapoor", "Kabir Shah", "Dev Malhotra", "Isha Verma", "Sana Ali"];

const staffNavigation = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "projects" as View, label: "Projects", icon: FolderKanban },
  { id: "releases" as View, label: "Releases", icon: PackageCheck },
  { id: "feedback" as View, label: "Feedback", icon: MessageSquareWarning },
  { id: "clients" as View, label: "Clients & access", icon: Building2 },
  { id: "reports" as View, label: "Reports", icon: BarChart3 },
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
  };
}

function feedbackIcon(type: string) {
  if (type === "Bug") return Bug;
  if (type === "Change request") return RefreshCcw;
  if (type === "Content") return Type;
  return MessageCircleQuestion;
}

export function DeliveryLoopApp() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [view, setView] = useState<View>("overview");
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [memberClientId, setMemberClientId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<{ status: number; message: string } | null>(null);

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
  }

  useEffect(() => {
    load().catch((error) => setAccessError({ status: 500, message: error instanceof Error ? error.message : "Unable to load workspace" }));
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3400);
  }

  async function runAction(action: string, payload: ActionPayload, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Action failed");
      await load();
      setModal(null);
      notify(success);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Action failed");
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
  const navigation = isClientView ? [...clientNavigation, ...(canManageClientMembers ? [clientAdminNavigation] : [])] : staffNavigation;

  const visibleTickets = data.tickets.filter((ticket) => {
    const project = data.projects.find((item) => item.id === ticket.project_id);
    const searchable = `${ticket.key} ${ticket.title} ${ticket.reporter} ${project?.name || ""}`.toLowerCase();
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
          <div className="account-row">
            <span className="avatar">{initials(actor.name)}</span>
            <div><strong>{actor.name}</strong><small>{roleLabel(actor.role)}</small></div>
            <a href="/signout-with-chatgpt?return_to=/" aria-label="Sign out"><LockKeyhole size={15} /></a>
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
            {!isClientView && view === "projects" ? <button className="secondary-button" onClick={() => setModal("project")}><Plus size={15} /> New project</button> : null}
            {!isClientView && view === "clients" ? <button className="secondary-button" onClick={() => setModal("client")}><Plus size={15} /> New client</button> : null}
            {!isClientView && view === "releases" ? <button className="primary-button" onClick={() => setModal("release")}><Plus size={15} /> New release</button> : null}
            {(view === "feedback" || isClientView) && canReport ? <button className="primary-button" onClick={() => setModal("feedback")}><Plus size={15} /> Report feedback</button> : null}
          </div>
        </header>

        {view === "overview" && !isClientView ? (
          <Overview data={data} openTickets={openTickets} blockers={blockers} retest={retest} testingReleases={testingReleases} setView={setView} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} setSelectedTicketId={setSelectedTicketId} />
        ) : null}
        {view === "projects" ? <Projects data={data} isClientView={isClientView} clientById={clientById} setView={setView} setSelectedReleaseId={setSelectedReleaseId} /> : null}
        {view === "releases" ? <Releases data={data} actor={actor} isClientView={isClientView} selectedRelease={selectedRelease} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} runAction={runAction} busy={busy} /> : null}
        {view === "feedback" ? <Feedback data={data} tickets={visibleTickets} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} setSelectedTicketId={setSelectedTicketId} /> : null}
        {view === "clients" && (!isClientView || canManageClientMembers) ? <Clients data={data} openMemberModal={openMemberModal} /> : null}
        {view === "reports" && !isClientView ? <Reports data={data} /> : null}
      </main>

      {selectedTicket ? (
        <FeedbackDrawer ticket={selectedTicket} project={projectById(selectedTicket.project_id)} release={releaseById(selectedTicket.release_id)} comments={data.comments.filter((comment) => comment.ticket_id === selectedTicket.id)} isClientView={isClientView} canRespond={canReport} close={() => setSelectedTicketId(null)} runAction={runAction} busy={busy} />
      ) : null}
      {modal ? (
        <ActionModal modal={modal} data={isClientView ? data : workspace} isClientView={isClientView} selectedRelease={selectedRelease} memberClientId={memberClientId} close={() => setModal(null)} runAction={runAction} busy={busy} notify={notify} />
      ) : null}
      {toast ? <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div> : null}
    </div>
  );
}

function pageTitle(view: View, isClientView: boolean) {
  if (isClientView) return ({ releases: "Release testing", feedback: "Feedback and retesting", projects: "Project details", overview: "Overview", clients: "Access", reports: "Reports" } as Record<View, string>)[view];
  return ({ overview: "Delivery overview", projects: "Projects", releases: "Release centre", feedback: "Feedback inbox", clients: "Clients and access", reports: "UAT reporting" } as Record<View, string>)[view];
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-symbol large"><span /></span><div><strong>DeliveryLoop</strong><small>Preparing your workspace</small></div></main>;
}

function AccessScreen({ error }: { error: { status: number; message: string } }) {
  const needsSignIn = error.status === 401;
  return <main className="access-screen"><section><span className="brand-symbol large"><span /></span><p>DeliveryLoop</p><h1>{needsSignIn ? "Sign in to your workspace" : "Access has not been granted"}</h1><div>{error.message}</div>{needsSignIn ? <a className="primary-button" href="/signin-with-chatgpt?return_to=/"><LockKeyhole size={16} /> Sign in with ChatGPT</a> : <p className="access-note">Ask your DeliveryLoop administrator to add this email to the correct client or agency workspace.</p>}</section></main>;
}

function Overview({ data, openTickets, blockers, retest, testingReleases, setView, setSelectedReleaseId, projectById, clientById, setSelectedTicketId }: { data: Workspace; openTickets: Ticket[]; blockers: Ticket[]; retest: Ticket[]; testingReleases: Release[]; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; setSelectedTicketId: (id: string) => void }) {
  const verified = data.tickets.filter((ticket) => closedStatuses.has(ticket.status)).length;
  return <div className="page-content overview-page">
    <section className="summary-strip" aria-label="Delivery summary">
      <div><span>Releases in UAT</span><strong>{testingReleases.length}</strong><small>{data.releases.length} releases tracked</small></div>
      <div><span>Open feedback</span><strong>{openTickets.length}</strong><small>{blockers.length} high-impact items</small></div>
      <div><span>Waiting on client</span><strong>{retest.length}</strong><small>Ready for retest</small></div>
      <div><span>Closed this cycle</span><strong>{verified}</strong><small>{data.tickets.length ? Math.round((verified / data.tickets.length) * 100) : 0}% completion</small></div>
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

function Projects({ data, isClientView, clientById, setView, setSelectedReleaseId }: { data: Workspace; isClientView: boolean; clientById: (id: string) => Client | undefined; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void }) {
  return <div className="page-content"><div className="project-list">{data.projects.map((project) => {
    const client = clientById(project.client_id); const releases = data.releases.filter((release) => release.project_id === project.id); const tickets = data.tickets.filter((ticket) => ticket.project_id === project.id); const current = releases.find((release) => release.status !== "Approved") || releases[0];
    return <article className="project-row-card" key={project.id}><div className="project-identity"><span style={{ background: client?.accent }}>{project.code}</span><div><p>{client?.name}</p><h2>{project.name}</h2><small>{project.description}</small></div></div><dl><div><dt>Lead</dt><dd>{project.manager}</dd></div><div><dt>Stage</dt><dd><StatusBadge value={project.stage} /></dd></div><div><dt>Open feedback</dt><dd>{tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length}</dd></div><div><dt>Current release</dt><dd>{current?.version || "—"}</dd></div></dl><div className="row-actions">{project.staging_url ? <a href={project.staging_url} target="_blank" rel="noreferrer" className="quiet-button">Staging <ExternalLink size={14} /></a> : null}{current ? <button className="secondary-button" onClick={() => { setSelectedReleaseId(current.id); setView("releases"); }}>View release <ChevronRight size={14} /></button> : null}</div>{isClientView ? <span className="client-access-note"><ShieldCheck size={14} /> Your organisation only</span> : null}</article>;
  })}</div></div>;
}

function Releases({ data, actor, isClientView, selectedRelease, setSelectedReleaseId, projectById, clientById, runAction, busy }: { data: Workspace; actor: Actor; isClientView: boolean; selectedRelease?: Release; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; runAction: (action: string, payload: ActionPayload, success: string) => Promise<void>; busy: boolean }) {
  if (!selectedRelease) return <div className="page-content"><EmptyState icon={PackageCheck} title="No releases yet" body="Create the first release to begin client UAT." /></div>;
  const project = projectById(selectedRelease.project_id); const client = clientById(project?.client_id || "");
  const checks = data.checklist.filter((item) => item.release_id === selectedRelease.id);
  const releaseTickets = data.tickets.filter((ticket) => ticket.release_id === selectedRelease.id);
  const open = releaseTickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const blockers = open.filter((ticket) => ["Critical", "High"].includes(ticket.severity));
  const incomplete = checks.filter((item) => item.state !== "Passed");
  const canApprove = blockers.length === 0 && incomplete.length === 0 && selectedRelease.status !== "Approved";
  const canSign = actor.isStaff || actor.role === "client_admin";
  const canTest = actor.isStaff || ["client_admin", "client_tester"].includes(actor.role);
  const cycle = (state: string) => state === "Not tested" ? "Passed" : state === "Passed" ? "Failed" : "Not tested";
  return <div className="page-content release-page">
    <aside className="release-index"><p>Release history</p>{data.releases.map((release) => <button key={release.id} className={release.id === selectedRelease.id ? "active" : ""} onClick={() => setSelectedReleaseId(release.id)}><span className={`release-dot ${release.status.toLowerCase()}`} /><span><b>{release.version}</b><small>{release.name}</small></span><time>{formatDate(release.due_date)}</time></button>)}</aside>
    <section className="release-content">
      <article className="release-summary surface"><div className="release-summary-top"><div className="release-title"><span style={{ background: client?.accent }}>{initials(client?.name || "CL")}</span><div><p>{client?.name} / {project?.name}</p><h2>{selectedRelease.name}</h2><small>{selectedRelease.version} · {selectedRelease.build}</small></div></div><StatusBadge value={selectedRelease.status} /></div><p className="release-brief">{selectedRelease.testing_notes}</p><dl><div><CalendarDays size={16} /><span><dt>Testing window</dt><dd>{formatDate(selectedRelease.start_date)} – {formatDate(selectedRelease.due_date, true)}</dd></span></div><div><Inbox size={16} /><span><dt>Feedback</dt><dd>{open.length} open / {releaseTickets.length} total</dd></span></div><div><AlertTriangle size={16} /><span><dt>Blocking</dt><dd className={blockers.length ? "danger-text" : "success-text"}>{blockers.length || "Clear"}</dd></span></div></dl></article>
      <div className="release-workspace">
        <article className="surface checklist-panel"><header className="section-header"><div><p>Acceptance scope</p><h2>UAT checklist</h2></div><span className="fraction">{checks.filter((item) => item.state === "Passed").length} / {checks.length}</span></header><div className="checklist-list">{checks.map((item) => <button key={item.id} disabled={busy || selectedRelease.status === "Approved" || !canTest} onClick={() => runAction("updateChecklist", { itemId: item.id, state: cycle(item.state) }, `Updated “${item.title}”`)}><span className={`check-box ${item.state.toLowerCase().replace(" ", "-")}`}>{item.state === "Passed" ? <Check size={14} /> : item.state === "Failed" ? <X size={14} /> : null}</span><span><b>{item.title}</b><small>{item.state}</small></span></button>)}</div></article>
        <article className="surface approval-panel"><header className="section-header"><div><p>Delivery gate</p><h2>{selectedRelease.status === "Approved" ? "Release accepted" : "Client sign-off"}</h2></div><ShieldCheck size={18} /></header>{selectedRelease.status === "Approved" ? <div className="approved-state"><CheckCircle2 size={28} /><h3>Accepted by {selectedRelease.approved_by}</h3><p>{formatDate(selectedRelease.approved_at || "", true)}</p><small>The immutable audit event has been recorded.</small></div> : <><div className="gate-list"><GateRow passed={!blockers.length} title="No open blockers" detail={blockers.length ? `${blockers.length} high-impact items remain` : "Requirement met"} /><GateRow passed={!incomplete.length} title="Checklist complete" detail={incomplete.length ? `${incomplete.length} checks are not passed` : "Requirement met"} /><GateRow passed={canSign} title="Authorised approver" detail={canSign ? roleLabel(actor.role) : "Client admin approval required"} /></div><button className="primary-button full" disabled={!canApprove || !canSign || busy} onClick={() => runAction("approveRelease", { releaseId: selectedRelease.id }, "Release approved and recorded")}>{canApprove && canSign ? "Approve release" : "Complete the gates above"}</button><p className="approval-note">Approval captures the release build, approver and timestamp.</p></>}</article>
      </div>
      {isClientView ? <div className="client-help"><ShieldCheck size={17} /><span><b>You are reviewing your organisation’s release.</b><small>Internal delivery notes and other client workspaces are hidden.</small></span></div> : null}
    </section>
  </div>;
}

function GateRow({ passed, title, detail }: { passed: boolean; title: string; detail: string }) {
  return <div><span className={passed ? "pass" : "block"}>{passed ? <Check size={13} /> : <AlertCircle size={13} />}</span><p><b>{title}</b><small>{detail}</small></p></div>;
}

function Feedback({ data, tickets, query, setQuery, statusFilter, setStatusFilter, setSelectedTicketId }: { data: Workspace; tickets: Ticket[]; query: string; setQuery: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; setSelectedTicketId: (id: string) => void }) {
  return <div className="page-content feedback-page"><div className="filter-row"><label className="search-box"><Search size={16} /><input aria-label="Search feedback" placeholder="Search feedback, project or reporter" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="filter-select"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label><span className="result-count">{tickets.length} results</span></div><article className="surface feedback-surface"><FeedbackTable tickets={tickets} projects={data.projects} onOpen={setSelectedTicketId} /></article></div>;
}

function FeedbackTable({ tickets, projects, onOpen, compact = false }: { tickets: Ticket[]; projects: Project[]; onOpen: (id: string) => void; compact?: boolean }) {
  return <div className={`feedback-table ${compact ? "compact" : ""}`}><div className="feedback-head"><span>Feedback</span><span>Project</span><span>Status</span><span>Priority</span><span>Owner</span></div>{tickets.length ? tickets.map((ticket) => {
    const project = projects.find((item) => item.id === ticket.project_id); const Icon = feedbackIcon(ticket.type);
    return <button className="feedback-row" key={ticket.id} onClick={() => onOpen(ticket.id)}><span className="feedback-title"><i className={`feedback-type ${ticket.type.toLowerCase().replace(" ", "-")}`}><Icon size={15} /></i><span><b>{ticket.title}</b><small>{ticket.key} · {ticket.reporter}</small></span></span><span className="project-reference"><b>{project?.code}</b><small>{project?.name}</small></span><StatusBadge value={ticket.status} /><span className={`priority-label ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span><span className="owner-cell"><i>{initials(ticket.assignee)}</i>{ticket.assignee}</span></button>;
  }) : <EmptyState icon={Inbox} title="No feedback in this view" body="Change the filters or report a new issue." />}</div>;
}

function Clients({ data, openMemberModal }: { data: Workspace; openMemberModal: (clientId: string) => void }) {
  return <div className="page-content client-page"><div className="access-intro surface"><div><ShieldCheck size={19} /><span><p>Tenant-aware access</p><h2>Each client only sees their own projects, releases and public conversations.</h2></span></div><small>Members sign in with the exact email registered below.</small></div><div className="client-list">{data.clients.map((client) => {
    const projects = data.projects.filter((project) => project.client_id === client.id); const members = data.members.filter((member) => member.client_id === client.id && member.active === "1"); const tickets = data.tickets.filter((ticket) => projects.some((project) => project.id === ticket.project_id));
    return <article className="surface client-access-card" key={client.id}><header><span style={{ background: client.accent }}>{initials(client.name)}</span><div><h2>{client.name}</h2><p>{client.contact_name} · {client.contact_email}</p></div><button className="secondary-button" onClick={() => openMemberModal(client.id)}><UserPlus size={15} /> Add member</button></header><div className="client-stats"><div><span>Projects</span><b>{projects.length}</b></div><div><span>Open feedback</span><b>{tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length}</b></div><div><span>Active members</span><b>{members.length}</b></div></div><div className="member-list"><div className="member-head"><span>Member</span><span>Role</span><span>Status</span></div>{members.map((member) => <div key={member.id}><span className="member-person"><i>{initials(member.name)}</i><span><b>{member.name}</b><small>{member.email}</small></span></span><span>{roleLabel(member.role)}</span><span className="active-status"><i /> Active</span></div>)}</div></article>;
  })}</div></div>;
}

function Reports({ data }: { data: Workspace }) {
  const total = data.tickets.length; const complete = data.tickets.filter((ticket) => closedStatuses.has(ticket.status)).length; const completion = total ? Math.round((complete / total) * 100) : 0; const types = ["Bug", "Change request", "Content", "Question"];
  function exportCsv() { const rows = [["Key", "Title", "Type", "Severity", "Priority", "Status", "Reporter", "Assignee"], ...data.tickets.map((ticket) => [ticket.key, ticket.title, ticket.type, ticket.severity, ticket.priority, ticket.status, ticket.reporter, ticket.assignee])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "deliveryloop-uat-report.csv"; link.click(); URL.revokeObjectURL(url); }
  return <div className="page-content report-page"><div className="report-actions"><p>Portfolio-wide UAT performance and delivery evidence.</p><button className="secondary-button" onClick={exportCsv}><Download size={15} /> Export CSV</button></div><div className="report-grid"><article className="surface completion-panel"><header className="section-header"><div><p>Portfolio health</p><h2>UAT completion</h2></div><span>{completion}%</span></header><div className="completion-body"><div className="completion-meter"><i style={{ width: `${completion}%` }} /></div><dl><div><dt>Feedback captured</dt><dd>{total}</dd></div><div><dt>Verified or closed</dt><dd>{complete}</dd></div><div><dt>Open blockers</dt><dd>{data.tickets.filter((ticket) => !closedStatuses.has(ticket.status) && ["Critical", "High"].includes(ticket.severity)).length}</dd></div></dl></div></article><article className="surface type-panel"><header className="section-header"><div><p>Scope clarity</p><h2>Feedback by type</h2></div></header><div className="type-bars">{types.map((type) => { const count = data.tickets.filter((ticket) => ticket.type === type).length; return <div key={type}><span><b>{type}</b><em>{count}</em></span><i><u style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></i></div>; })}</div></article></div><article className="surface audit-panel"><header className="section-header"><div><p>Evidence</p><h2>Acceptance trail</h2></div><FileText size={17} /></header><div className="audit-table"><div className="audit-head"><span>Event</span><span>Actor</span><span>Details</span><span>Date</span></div>{data.audit.map((event) => <div key={event.id}><b>{event.action}</b><span>{event.actor}</span><span>{event.details || "—"}</span><time>{formatDate(event.created_at, true)}</time></div>)}</div></article></div>;
}

function FeedbackDrawer({ ticket, project, release, comments, isClientView, canRespond, close, runAction, busy }: { ticket: Ticket; project?: Project; release?: Release; comments: Comment[]; isClientView: boolean; canRespond: boolean; close: () => void; runAction: (action: string, payload: ActionPayload, success: string) => Promise<void>; busy: boolean }) {
  const visibleComments = comments.filter((comment) => !isClientView || comment.visibility === "public");
  async function submitReply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const body = field(form, "body"); if (!body) return; await runAction("addComment", { ticketId: ticket.id, body, visibility: isClientView ? "public" : field(form, "visibility") || "public" }, "Update added"); }
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="feedback-drawer"><header><div><p>{ticket.key} · {project?.name}</p><h2>{ticket.title}</h2></div><button onClick={close} aria-label="Close feedback"><X size={19} /></button></header><div className="drawer-scroll"><div className="badge-row"><TypeBadge value={ticket.type} /><SeverityBadge value={ticket.severity} /></div><section className="problem-card"><div><span>Observed</span><p>{ticket.actual}</p></div><div><span>Expected</span><p>{ticket.expected}</p></div></section>{ticket.attachment_key ? <a className="attachment-link" href={`/api/uploads/${encodeURIComponent(ticket.attachment_key)}`} target="_blank" rel="noreferrer"><Paperclip size={15} /> View screenshot <ExternalLink size={13} /></a> : null}<section className="property-grid"><label>Status<select disabled={busy || isClientView} value={ticket.status} onChange={(event) => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: event.target.value }, `Status changed to ${event.target.value}`)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label><label>Priority<select disabled={busy || isClientView} value={ticket.priority} onChange={(event) => runAction("updateTicket", { ticketId: ticket.id, field: "priority", value: event.target.value }, `Priority changed to ${event.target.value}`)}>{["Urgent", "High", "Normal", "Low"].map((priority) => <option key={priority}>{priority}</option>)}</select></label><label>Assignee<select disabled={busy || isClientView} value={ticket.assignee} onChange={(event) => runAction("updateTicket", { ticketId: ticket.id, field: "assignee", value: event.target.value }, `Assigned to ${event.target.value}`)}>{people.map((person) => <option key={person}>{person}</option>)}</select></label><label>Release<span>{release?.version} · {ticket.build}</span></label></section><section className="context-panel"><header><MonitorSmartphone size={15} /> Captured context</header><dl><div><dt>Page</dt><dd>{ticket.page_url || "Not supplied"}</dd></div><div><dt>Browser</dt><dd>{ticket.browser || "Not supplied"}</dd></div><div><dt>Viewport</dt><dd>{ticket.viewport || "Not supplied"}</dd></div><div><dt>Reporter</dt><dd>{ticket.reporter}</dd></div></dl></section>{isClientView && canRespond && ticket.status === "Ready for retest" ? <section className="retest-panel"><div><RefreshCcw size={18} /><span><b>A fix is ready to test</b><small>Confirm the result in {release?.build}.</small></span></div><footer><button className="secondary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Reopened" }, "Feedback reopened")}>Still broken</button><button className="primary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Verified" }, "Fix verified")}>Verify fix</button></footer></section> : null}<section className="conversation"><header><div><p>Conversation</p><h3>{visibleComments.length} updates</h3></div></header>{visibleComments.map((comment) => <div className={`comment ${comment.visibility}`} key={comment.id}><span className="avatar small">{initials(comment.author)}</span><div><p><b>{comment.author}</b>{comment.visibility === "internal" ? <em>Internal</em> : null}<time>{formatDate(comment.created_at)}</time></p><div>{comment.body}</div></div></div>)}{canRespond ? <form className="reply-form" onSubmit={submitReply}><textarea name="body" placeholder={isClientView ? "Reply to the delivery team" : "Add an update"} required />{!isClientView ? <label><input type="checkbox" name="visibility" value="internal" /> Internal note</label> : <span />}<button className="primary-button" disabled={busy}><Send size={14} /> Send</button></form> : <p className="approval-note">This account has read-only access to the conversation.</p>}</section></div></aside></div>;
}

function ActionModal({ modal, data, isClientView, selectedRelease, memberClientId, close, runAction, busy, notify }: { modal: Exclude<Modal, null>; data: Workspace; isClientView: boolean; selectedRelease?: Release; memberClientId: string | null; close: () => void; runAction: (action: string, payload: ActionPayload, success: string) => Promise<void>; busy: boolean; notify: (message: string) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      if (modal === "client") return runAction("createClient", { name: field(form, "name"), contactName: field(form, "contactName"), contactEmail: field(form, "contactEmail"), accent: field(form, "accent") }, "Client workspace created");
      if (modal === "member") return runAction("createMember", { clientId: memberClientId || field(form, "clientId"), name: field(form, "name"), email: field(form, "email"), role: field(form, "role") }, "Member access added");
      if (modal === "project") return runAction("createProject", { clientId: field(form, "clientId"), name: field(form, "name"), code: field(form, "code"), description: field(form, "description"), manager: field(form, "manager"), stage: "UAT", stagingUrl: field(form, "stagingUrl") }, "Project created");
      if (modal === "release") return runAction("createRelease", { projectId: field(form, "projectId"), name: field(form, "name"), version: field(form, "version"), build: field(form, "build"), startDate: field(form, "startDate"), dueDate: field(form, "dueDate"), testingNotes: field(form, "testingNotes"), checklist: field(form, "checklist").split("\n").filter(Boolean) }, "Release prepared");
      const file = form.get("screenshot"); let attachmentKey = "";
      if (file instanceof File && file.size) { const uploadData = new FormData(); uploadData.append("file", file); const upload = await fetch("/api/uploads", { method: "POST", body: uploadData }); const body = await upload.json() as { key?: string; error?: string }; if (!upload.ok || !body.key) throw new Error(body.error || "Screenshot upload failed"); attachmentKey = body.key; }
      const releaseId = field(form, "releaseId") || selectedRelease?.id || data.releases[0]?.id; const release = data.releases.find((item) => item.id === releaseId);
      if (!release) throw new Error("Choose a release before reporting feedback");
      await runAction("createTicket", { projectId: release.project_id, releaseId, type: field(form, "type"), title: field(form, "title"), actual: field(form, "actual"), expected: field(form, "expected"), severity: field(form, "severity"), pageUrl: field(form, "pageUrl"), browser: navigator.userAgent, viewport: `${window.innerWidth} x ${window.innerHeight}`, build: release.build, attachmentKey }, "Feedback submitted");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save");
    }
  }
  const title = ({ feedback: "Report feedback", project: "Create project", release: "Prepare release", client: "Create client workspace", member: "Add workspace member" } as Record<Exclude<Modal, null>, string>)[modal];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><p>DeliveryLoop</p><h2>{title}</h2></div><button onClick={close} aria-label="Close"><X size={19} /></button></header><form onSubmit={submit}>
    {modal === "feedback" ? <><label className="span-2">Release<select name="releaseId" defaultValue={selectedRelease?.id || data.releases[0]?.id}>{data.releases.map((release) => <option key={release.id} value={release.id}>{data.projects.find((project) => project.id === release.project_id)?.name} · {release.version}</option>)}</select></label><label>Feedback type<select name="type" defaultValue="Bug"><option>Bug</option><option>Change request</option><option>Content</option><option>Question</option></select></label><label>Severity<select name="severity" defaultValue="Medium"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><label className="span-2">Short title<input name="title" placeholder="Describe the issue clearly" required /></label><label className="span-2">What happened?<textarea name="actual" placeholder="What did you see and how did you get here?" required /></label><label className="span-2">What did you expect?<textarea name="expected" placeholder="Describe the expected result" required /></label><label className="span-2">Page or screen<input name="pageUrl" placeholder="/checkout/payment or a staging URL" /></label><label className="span-2 upload-field"><UploadCloud size={18} /><span><b>Attach a screenshot</b><small>PNG, JPG, WebP or GIF, up to 8 MB</small></span><input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label></> : null}
    {modal === "client" ? <><label className="span-2">Company name<input name="name" required placeholder="Acme Limited" /></label><label>Primary contact<input name="contactName" required placeholder="Contact name" /></label><label>Email<input name="contactEmail" type="email" required placeholder="client@company.com" /></label><label className="span-2">Workspace colour<input name="accent" type="color" defaultValue="#3157D5" /></label></> : null}
    {modal === "member" ? <><div className="modal-callout span-2"><ShieldCheck size={17} /><span>This email becomes the member’s identity when they sign in.</span></div><label className="span-2">Client<select name="clientId" defaultValue={memberClientId || ""} disabled={Boolean(memberClientId)}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Name<input name="name" required placeholder="Full name" /></label><label>Email<input name="email" type="email" required placeholder="person@client.com" /></label><label className="span-2">Role<select name="role" defaultValue="client_tester"><option value="client_admin">Client admin</option><option value="client_tester">Client tester</option><option value="client_viewer">Client viewer</option></select></label></> : null}
    {modal === "project" ? <><label className="span-2">Client<select name="clientId">{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Project name<input name="name" required placeholder="Customer portal" /></label><label>Project code<input name="code" required maxLength={5} placeholder="CPT" /></label><label className="span-2">Purpose<textarea name="description" required placeholder="What is being delivered?" /></label><label>Project lead<input name="manager" required placeholder="Team member" /></label><label>Staging URL<input name="stagingUrl" type="url" placeholder="https://staging.example.com" /></label></> : null}
    {modal === "release" ? <><label className="span-2">Project<select name="projectId">{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="span-2">Release name<input name="name" required placeholder="Checkout and promotions UAT" /></label><label>Version<input name="version" required placeholder="v1.0" /></label><label>Build<input name="build" required placeholder="build-001" /></label><label>Testing starts<input name="startDate" type="date" required /></label><label>Testing due<input name="dueDate" type="date" required /></label><label className="span-2">Testing instructions<textarea name="testingNotes" required placeholder="What should the client focus on?" /></label><label className="span-2">Acceptance checklist<textarea name="checklist" required placeholder={"One acceptance flow per line\nGuest checkout\nPayment recovery\nEmail confirmation"} /></label></> : null}
    <footer><button type="button" className="quiet-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : isClientView && modal === "feedback" ? "Submit to delivery team" : "Save"}</button></footer>
  </form></section></div>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase().replaceAll(" ", "-").replaceAll("/", "-")}`}><i />{value}</span>;
}

function TypeBadge({ value }: { value: string }) {
  const Icon = feedbackIcon(value);
  return <span className="type-badge"><Icon size={13} />{value}</span>;
}

function SeverityBadge({ value }: { value: string }) {
  return <span className={`severity-badge ${value.toLowerCase()}`}><i />{value} severity</span>;
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Inbox; title: string; body: string }) {
  return <div className="empty-state"><Icon size={24} /><h3>{title}</h3><p>{body}</p></div>;
}
