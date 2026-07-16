"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Client = { id: string; name: string; contact_name: string; contact_email: string; accent: string; created_at: string };
type Project = { id: string; client_id: string; name: string; code: string; description: string; manager: string; stage: string; staging_url: string; created_at: string };
type Release = { id: string; project_id: string; name: string; version: string; build: string; status: string; start_date: string; due_date: string; testing_notes: string; approved_at: string | null; approved_by: string | null; created_at: string };
type ChecklistItem = { id: string; release_id: string; title: string; state: string; created_at: string };
type Ticket = { id: string; key: string; project_id: string; release_id: string; type: string; title: string; actual: string; expected: string; severity: string; priority: string; status: string; reporter: string; assignee: string; page_url: string; browser: string; viewport: string; build: string; attachment_key: string | null; created_at: string; updated_at: string };
type Comment = { id: string; ticket_id: string; author: string; body: string; visibility: string; created_at: string };
type AuditEvent = { id: string; entity_type: string; entity_id: string; action: string; actor: string; details: string; created_at: string };
type Workspace = { clients: Client[]; projects: Project[]; releases: Release[]; checklist: ChecklistItem[]; tickets: Ticket[]; comments: Comment[]; audit: AuditEvent[] };
type View = "overview" | "projects" | "releases" | "feedback" | "clients" | "reports";
type Modal = "feedback" | "project" | "release" | "client" | null;
type ActionPayload = Record<string, string | string[]>;

const nav: { id: View; label: string; mark: string }[] = [
  { id: "overview", label: "Overview", mark: "⌂" },
  { id: "projects", label: "Projects", mark: "◇" },
  { id: "releases", label: "Releases", mark: "◫" },
  { id: "feedback", label: "Feedback", mark: "◎" },
  { id: "clients", label: "Clients", mark: "◉" },
  { id: "reports", label: "Reports", mark: "↗" },
];

const closedStatuses = new Set(["Verified", "Closed", "Deferred", "Rejected / out of scope"]);
const statusOptions = ["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Verified", "Closed", "Deferred", "Rejected / out of scope"];
const people = ["Unassigned", "Aarav Patel", "Neha Kapoor", "Kabir Shah", "Dev Malhotra", "Isha Verma", "Sana Ali"];

function formatDate(value: string, includeYear = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}) }).format(new Date(`${value.length === 10 ? value + "T12:00:00" : value}`));
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function field(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

export function DeliveryLoopApp() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [actor, setActor] = useState("Demo Operator");
  const [view, setView] = useState<View>("overview");
  const [portal, setPortal] = useState<"staff" | "client">("staff");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const body = await response.json() as { workspace?: Workspace; actor?: string; error?: string };
    if (!response.ok || !body.workspace) throw new Error(body.error || "Unable to load workspace");
    setWorkspace(body.workspace);
    setActor(body.actor || "Demo Operator");
    setSelectedReleaseId((current) => current || body.workspace?.releases.find((item) => item.status === "Testing")?.id || body.workspace?.releases[0]?.id || null);
  }

  useEffect(() => {
    load().catch((error) => setToast(error.message));
  }, []);

  async function runAction(action: string, payload: ActionPayload, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Action failed");
      await load();
      setModal(null);
      setToast(success);
      window.setTimeout(() => setToast(null), 3200);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const data = workspace;
  const projectById = (id: string) => data?.projects.find((project) => project.id === id);
  const clientById = (id: string) => data?.clients.find((client) => client.id === id);
  const releaseById = (id: string) => data?.releases.find((release) => release.id === id);
  const selectedRelease = data?.releases.find((release) => release.id === selectedReleaseId) || data?.releases[0];
  const selectedTicket = data?.tickets.find((ticket) => ticket.id === selectedTicketId) || null;

  const visibleTickets = useMemo(() => {
    if (!data) return [];
    return data.tickets.filter((ticket) => {
      const project = data.projects.find((item) => item.id === ticket.project_id);
      const matchesQuery = `${ticket.key} ${ticket.title} ${ticket.reporter} ${project?.name || ""}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All statuses" || ticket.status === statusFilter;
      const clientScope = portal === "staff" || ticket.project_id === "project-northstar";
      return matchesQuery && matchesStatus && clientScope;
    });
  }, [data, query, statusFilter, portal]);

  if (!data) {
    return <main className="loading-shell"><div className="loading-mark">DL</div><div className="loading-line" /><p>Preparing your delivery workspace…</p></main>;
  }

  const openTickets = data.tickets.filter((ticket) => !closedStatuses.has(ticket.status));
  const blockers = openTickets.filter((ticket) => ticket.severity === "Critical" || ticket.severity === "High");
  const retest = data.tickets.filter((ticket) => ticket.status === "Ready for retest");
  const testingReleases = data.releases.filter((release) => ["Testing", "Retest"].includes(release.status));
  const portalProject = data.projects.find((item) => item.id === "project-northstar") || data.projects[0];
  const clientRelease = data.releases.find((item) => item.project_id === portalProject.id && item.status !== "Approved") || data.releases.find((item) => item.project_id === portalProject.id);

  function setPortalMode(mode: "staff" | "client") {
    setPortal(mode);
    setView(mode === "client" ? "releases" : "overview");
    if (mode === "client" && clientRelease) setSelectedReleaseId(clientRelease.id);
    setSelectedTicketId(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => { setPortalMode("staff"); setView("overview"); }} aria-label="DeliveryLoop home">
          <span className="brand-mark">DL</span>
          <span><b>DeliveryLoop</b><small>UAT workspace</small></span>
        </button>

        {portal === "staff" ? (
          <nav className="side-nav" aria-label="Main navigation">
            <p className="nav-label">Workspace</p>
            {nav.map((item) => (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setSelectedTicketId(null); }}>
                <span className="nav-mark">{item.mark}</span>{item.label}
                {item.id === "feedback" && openTickets.length > 0 ? <em>{openTickets.length}</em> : null}
              </button>
            ))}
          </nav>
        ) : (
          <nav className="side-nav client-nav" aria-label="Client navigation">
            <p className="nav-label">Northstar Retail</p>
            <button className={view === "releases" ? "active" : ""} onClick={() => setView("releases")}><span className="nav-mark">◫</span>Current release</button>
            <button className={view === "feedback" ? "active" : ""} onClick={() => setView("feedback")}><span className="nav-mark">◎</span>Our feedback</button>
            <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}><span className="nav-mark">◇</span>Project details</button>
          </nav>
        )}

        <div className="sidebar-bottom">
          <div className="mode-switch" role="group" aria-label="Portal view">
            <button className={portal === "staff" ? "selected" : ""} onClick={() => setPortalMode("staff")}>Staff</button>
            <button className={portal === "client" ? "selected" : ""} onClick={() => setPortalMode("client")}>Client portal</button>
          </div>
          <div className="profile"><span>{initials(actor)}</span><div><b>{actor}</b><small>{portal === "staff" ? "Delivery team" : "Client preview"}</small></div></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">{portal === "staff" ? "Delivery operations" : `${portalProject.name} · Client UAT`}</span>
            <h1>{pageTitle(view, portal)}</h1>
          </div>
          <div className="top-actions">
            {portal === "staff" && view === "projects" ? <button className="secondary-button" onClick={() => setModal("project")}>New project</button> : null}
            {portal === "staff" && view === "clients" ? <button className="secondary-button" onClick={() => setModal("client")}>Add client</button> : null}
            {(view === "feedback" || portal === "client") ? <button className="primary-button" onClick={() => setModal("feedback")}><span>＋</span> Report feedback</button> : null}
            {portal === "staff" && view === "releases" ? <button className="primary-button" onClick={() => setModal("release")}><span>＋</span> New release</button> : null}
          </div>
        </header>

        {view === "overview" && portal === "staff" ? (
          <Overview data={data} openTickets={openTickets} blockers={blockers} retest={retest} testingReleases={testingReleases} setView={setView} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} />
        ) : null}

        {view === "projects" ? (
          <Projects data={data} portal={portal} projectById={projectById} clientById={clientById} setView={setView} setSelectedReleaseId={setSelectedReleaseId} />
        ) : null}

        {view === "releases" ? (
          <Releases data={data} portal={portal} selectedRelease={selectedRelease} setSelectedReleaseId={setSelectedReleaseId} projectById={projectById} clientById={clientById} runAction={runAction} busy={busy} />
        ) : null}

        {view === "feedback" ? (
          <Feedback data={data} tickets={visibleTickets} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} projectById={projectById} setSelectedTicketId={setSelectedTicketId} />
        ) : null}

        {view === "clients" && portal === "staff" ? <Clients data={data} /> : null}
        {view === "reports" && portal === "staff" ? <Reports data={data} /> : null}
      </main>

      {selectedTicket ? <TicketDrawer ticket={selectedTicket} project={projectById(selectedTicket.project_id)} release={releaseById(selectedTicket.release_id)} comments={data.comments.filter((comment) => comment.ticket_id === selectedTicket.id)} portal={portal} close={() => setSelectedTicketId(null)} runAction={runAction} busy={busy} /> : null}
      {modal ? <ActionModal modal={modal} data={data} portal={portal} selectedRelease={selectedRelease} close={() => setModal(null)} runAction={runAction} busy={busy} /> : null}
      {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
    </div>
  );
}

function pageTitle(view: View, portal: "staff" | "client") {
  if (portal === "client") return view === "feedback" ? "Feedback & retesting" : view === "projects" ? "Project details" : "Release testing";
  return ({ overview: "Good evening, delivery team", projects: "Projects", releases: "Release centre", feedback: "Feedback inbox", clients: "Client access", reports: "UAT reports" } as Record<View, string>)[view];
}

function Overview({ data, openTickets, blockers, retest, testingReleases, setView, setSelectedReleaseId, projectById, clientById }: { data: Workspace; openTickets: Ticket[]; blockers: Ticket[]; retest: Ticket[]; testingReleases: Release[]; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined }) {
  const metrics = [
    { label: "Active UAT releases", value: testingReleases.length, detail: "Across client workspaces", tone: "violet" },
    { label: "Open feedback", value: openTickets.length, detail: `${blockers.length} blocking items`, tone: "coral" },
    { label: "Waiting for client", value: retest.length, detail: "Ready for confirmation", tone: "mint" },
    { label: "Verified this cycle", value: data.tickets.filter((item) => item.status === "Verified").length, detail: "Accepted by QA or client", tone: "blue" },
  ];
  return <div className="page-content overview-page">
    <section className="metrics-grid">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-top"><span>{metric.label}</span><i>↗</i></div><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section>
    <section className="dashboard-grid">
      <article className="card release-radar">
        <div className="section-heading"><div><span className="eyebrow">Live testing</span><h2>Release readiness</h2></div><button className="text-button" onClick={() => setView("releases")}>View all</button></div>
        <div className="release-list">{testingReleases.map((release) => {
          const project = projectById(release.project_id); const client = clientById(project?.client_id || "");
          const items = data.checklist.filter((item) => item.release_id === release.id); const passed = items.filter((item) => item.state === "Passed").length;
          const completion = items.length ? Math.round((passed / items.length) * 100) : 0;
          const releaseBlockers = data.tickets.filter((ticket) => ticket.release_id === release.id && !closedStatuses.has(ticket.status) && ["Critical", "High"].includes(ticket.severity)).length;
          return <button className="release-row" key={release.id} onClick={() => { setSelectedReleaseId(release.id); setView("releases"); }}>
            <span className="client-logo" style={{ "--accent": client?.accent || "#625BF6" } as React.CSSProperties}>{initials(client?.name || "CL")}</span>
            <span className="release-copy"><b>{project?.name}</b><small>{release.name} · {release.version}</small></span>
            <span className="progress-wrap"><span><i style={{ width: `${completion}%` }} /></span><small>{completion}% checked</small></span>
            <span className={releaseBlockers ? "blocker-count danger" : "blocker-count"}>{releaseBlockers ? `${releaseBlockers} blockers` : "On track"}</span>
            <span className="chevron">›</span>
          </button>;
        })}</div>
      </article>
      <article className="card attention-card">
        <div className="section-heading"><div><span className="eyebrow">Attention</span><h2>Needs a decision</h2></div><span className="count-pill">{blockers.length}</span></div>
        <div className="attention-list">{blockers.slice(0, 4).map((ticket) => <button key={ticket.id} onClick={() => setView("feedback")}><span className={`severity-dot ${ticket.severity.toLowerCase()}`} /><span><b>{ticket.title}</b><small>{ticket.key} · {ticket.status}</small></span><em>{ticket.severity}</em></button>)}</div>
      </article>
    </section>
    <section className="dashboard-grid lower-grid">
      <article className="card recent-feedback"><div className="section-heading"><div><span className="eyebrow">Latest reports</span><h2>Recent feedback</h2></div><button className="text-button" onClick={() => setView("feedback")}>Open inbox</button></div><TicketTable tickets={data.tickets.slice(0, 5)} projects={data.projects} onOpen={() => setView("feedback")} compact /></article>
      <article className="card activity-card"><div className="section-heading"><div><span className="eyebrow">Audit trail</span><h2>Activity</h2></div></div><div className="activity-list">{data.audit.slice(0, 5).map((event) => <div key={event.id}><span className="activity-icon">{event.entity_type === "release" ? "R" : event.entity_type === "ticket" ? "F" : "•"}</span><p><b>{event.actor}</b> {event.action.toLowerCase()}<small>{event.details} · {formatDate(event.created_at)}</small></p></div>)}</div></article>
    </section>
  </div>;
}

function Projects({ data, portal, clientById, setView, setSelectedReleaseId }: { data: Workspace; portal: "staff" | "client"; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; setView: (view: View) => void; setSelectedReleaseId: (id: string) => void }) {
  const projects = portal === "client" ? data.projects.filter((project) => project.id === "project-northstar") : data.projects;
  return <div className="page-content"><div className="project-grid">{projects.map((project) => {
    const client = clientById(project.client_id); const releases = data.releases.filter((release) => release.project_id === project.id); const tickets = data.tickets.filter((ticket) => ticket.project_id === project.id); const current = releases.find((release) => release.status !== "Approved") || releases[0];
    return <article className="project-card" key={project.id}><div className="project-cover" style={{ "--accent": client?.accent || "#625BF6" } as React.CSSProperties}><span>{initials(project.code)}</span><em>{project.stage}</em></div><div className="project-body"><span className="eyebrow">{client?.name}</span><h2>{project.name}</h2><p>{project.description}</p><dl><div><dt>Project lead</dt><dd>{project.manager}</dd></div><div><dt>Open feedback</dt><dd>{tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length}</dd></div><div><dt>Latest release</dt><dd>{current?.version || "—"}</dd></div></dl><div className="card-actions"><a href={project.staging_url || "#"} target="_blank" rel="noreferrer" className="secondary-button">Open staging ↗</a>{current ? <button className="primary-button" onClick={() => { setSelectedReleaseId(current.id); setView("releases"); }}>View release</button> : null}</div></div></article>;
  })}</div></div>;
}

function Releases({ data, portal, selectedRelease, setSelectedReleaseId, projectById, clientById, runAction, busy }: { data: Workspace; portal: "staff" | "client"; selectedRelease?: Release; setSelectedReleaseId: (id: string) => void; projectById: (id: string) => Project | undefined; clientById: (id: string) => Client | undefined; runAction: (action: string, payload: ActionPayload, success: string) => Promise<void>; busy: boolean }) {
  const releases = portal === "client" ? data.releases.filter((release) => release.project_id === "project-northstar") : data.releases;
  if (!selectedRelease) return null;
  const project = projectById(selectedRelease.project_id); const client = clientById(project?.client_id || ""); const items = data.checklist.filter((item) => item.release_id === selectedRelease.id); const releaseTickets = data.tickets.filter((ticket) => ticket.release_id === selectedRelease.id); const open = releaseTickets.filter((ticket) => !closedStatuses.has(ticket.status)); const releaseBlockers = open.filter((ticket) => ["Critical", "High"].includes(ticket.severity)); const unpassed = items.filter((item) => item.state !== "Passed"); const canApprove = releaseBlockers.length === 0 && unpassed.length === 0 && selectedRelease.status !== "Approved";
  const cycle = (state: string) => state === "Not tested" ? "Passed" : state === "Passed" ? "Failed" : "Not tested";
  return <div className="page-content release-layout"><aside className="release-sidebar"><span className="eyebrow">Release history</span>{releases.map((release) => <button key={release.id} className={release.id === selectedRelease.id ? "selected" : ""} onClick={() => setSelectedReleaseId(release.id)}><span className={`release-state ${release.status.toLowerCase()}`} /> <span><b>{release.version}</b><small>{release.name}</small></span><em>{formatDate(release.due_date)}</em></button>)}</aside><section className="release-detail">
    <article className="release-hero"><div className="release-hero-top"><div><span className="client-logo large" style={{ "--accent": client?.accent || "#625BF6" } as React.CSSProperties}>{initials(client?.name || "CL")}</span><div><span className="eyebrow">{client?.name} · {project?.name}</span><h2>{selectedRelease.name}</h2><p>{selectedRelease.version} · {selectedRelease.build}</p></div></div><span className={`status-badge ${selectedRelease.status.toLowerCase()}`}>{selectedRelease.status}</span></div><p className="release-notes">{selectedRelease.testing_notes}</p><div className="release-meta"><div><span>Testing window</span><b>{formatDate(selectedRelease.start_date)} – {formatDate(selectedRelease.due_date, true)}</b></div><div><span>Feedback</span><b>{open.length} open · {releaseTickets.length} total</b></div><div><span>Blocking</span><b className={releaseBlockers.length ? "danger-text" : "success-text"}>{releaseBlockers.length ? `${releaseBlockers.length} issues` : "Clear"}</b></div></div></article>
    <div className="release-columns"><article className="card checklist-card"><div className="section-heading"><div><span className="eyebrow">Acceptance scope</span><h2>UAT checklist</h2></div><span className="count-pill">{items.filter((item) => item.state === "Passed").length}/{items.length}</span></div><div className="checklist">{items.map((item) => <button key={item.id} disabled={busy || selectedRelease.status === "Approved"} onClick={() => runAction("updateChecklist", { itemId: item.id, state: cycle(item.state) }, `Marked “${item.title}” as ${cycle(item.state).toLowerCase()}`)} className={item.state.toLowerCase().replace(" ", "-")}><span>{item.state === "Passed" ? "✓" : item.state === "Failed" ? "!" : ""}</span><p><b>{item.title}</b><small>{item.state}</small></p></button>)}</div></article><article className="card signoff-card"><div><span className="eyebrow">Delivery gate</span><h2>{selectedRelease.status === "Approved" ? "Release accepted" : "Client sign-off"}</h2></div>{selectedRelease.status === "Approved" ? <div className="approved-panel"><span>✓</span><h3>Approved by {selectedRelease.approved_by}</h3><p>{formatDate(selectedRelease.approved_at || "", true)} · Audit record saved</p></div> : <><div className="gate-list"><div className={releaseBlockers.length ? "blocked" : "passed"}><span>{releaseBlockers.length ? "!" : "✓"}</span><p><b>No open blockers</b><small>{releaseBlockers.length ? `${releaseBlockers.length} must be resolved or deferred` : "Requirement met"}</small></p></div><div className={unpassed.length ? "blocked" : "passed"}><span>{unpassed.length ? "!" : "✓"}</span><p><b>Checklist completed</b><small>{unpassed.length ? `${unpassed.length} items still need a pass` : "Requirement met"}</small></p></div></div><button className="primary-button full" disabled={!canApprove || busy} onClick={() => runAction("approveRelease", { releaseId: selectedRelease.id }, "Release approved and audit record created")}>{canApprove ? "Approve release" : "Complete acceptance gates"}</button><p className="fine-print">Approval records the exact build, approver, time and acceptance state.</p></>}</article></div>
  </section></div>;
}

function Feedback({ data, tickets, query, setQuery, statusFilter, setStatusFilter, projectById, setSelectedTicketId }: { data: Workspace; tickets: Ticket[]; query: string; setQuery: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; projectById: (id: string) => Project | undefined; setSelectedTicketId: (id: string) => void }) {
  return <div className="page-content"><div className="filterbar"><label className="search-field"><span>⌕</span><input aria-label="Search feedback" placeholder="Search by title, key, project or reporter" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select><span className="result-count">{tickets.length} items</span></div><article className="card table-card"><TicketTable tickets={tickets} projects={data.projects} onOpen={setSelectedTicketId} projectById={projectById} /></article></div>;
}

function TicketTable({ tickets, projects, onOpen, compact }: { tickets: Ticket[]; projects: Project[]; onOpen: (id: string) => void; projectById?: (id: string) => Project | undefined; compact?: boolean }) {
  return <div className={`ticket-table ${compact ? "compact" : ""}`}><div className="ticket-head"><span>Feedback</span><span>Project</span><span>Status</span><span>Priority</span><span>Assignee</span></div>{tickets.length ? tickets.map((ticket) => { const project = projects.find((item) => item.id === ticket.project_id); return <button className="ticket-row" key={ticket.id} onClick={() => onOpen(ticket.id)}><span className="ticket-title"><i className={`type-icon ${ticket.type.toLowerCase().replace(" ", "-")}`}>{ticket.type === "Bug" ? "B" : ticket.type === "Change request" ? "C" : ticket.type === "Content" ? "T" : "?"}</i><span><b>{ticket.title}</b><small>{ticket.key} · Reported by {ticket.reporter}</small></span></span><span className="project-cell"><b>{project?.code}</b><small>{project?.name}</small></span><span><em className={`status-badge ${ticket.status.toLowerCase().replaceAll(" ", "-")}`}>{ticket.status}</em></span><span className={`priority ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span><span className="assignee"><i>{initials(ticket.assignee)}</i>{ticket.assignee}</span></button>; }) : <div className="empty-state"><span>✓</span><h3>No feedback matches this view</h3><p>Try clearing the filters or submit a new report.</p></div>}</div>;
}

function Clients({ data }: { data: Workspace }) {
  return <div className="page-content"><div className="client-grid">{data.clients.map((client) => { const projects = data.projects.filter((project) => project.client_id === client.id); const tickets = data.tickets.filter((ticket) => projects.some((project) => project.id === ticket.project_id)); return <article className="client-card" key={client.id}><div className="client-card-head"><span className="client-logo large" style={{ "--accent": client.accent } as React.CSSProperties}>{initials(client.name)}</span><span className="status-badge testing">Active</span></div><h2>{client.name}</h2><p>{client.contact_name}</p><a href={`mailto:${client.contact_email}`}>{client.contact_email}</a><dl><div><dt>Projects</dt><dd>{projects.length}</dd></div><div><dt>Open feedback</dt><dd>{tickets.filter((ticket) => !closedStatuses.has(ticket.status)).length}</dd></div></dl><button className="secondary-button full">Manage access</button></article>; })}</div></div>;
}

function Reports({ data }: { data: Workspace }) {
  const total = data.tickets.length; const verified = data.tickets.filter((ticket) => closedStatuses.has(ticket.status)).length; const types = ["Bug", "Change request", "Content", "Question"];
  function exportCsv() { const rows = [["Key", "Title", "Type", "Severity", "Priority", "Status", "Reporter", "Assignee"], ...data.tickets.map((ticket) => [ticket.key, ticket.title, ticket.type, ticket.severity, ticket.priority, ticket.status, ticket.reporter, ticket.assignee])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "deliveryloop-uat-report.csv"; link.click(); URL.revokeObjectURL(url); }
  return <div className="page-content reports-grid"><article className="card report-summary"><div className="section-heading"><div><span className="eyebrow">Portfolio health</span><h2>UAT completion</h2></div><button className="secondary-button" onClick={exportCsv}>Export CSV</button></div><div className="donut-row"><div className="donut" style={{ "--progress": `${total ? Math.round((verified / total) * 100) : 0}%` } as React.CSSProperties}><span><b>{total ? Math.round((verified / total) * 100) : 0}%</b><small>completed</small></span></div><div className="report-kpis"><div><span>Feedback captured</span><b>{total}</b></div><div><span>Verified / closed</span><b>{verified}</b></div><div><span>Open blockers</span><b>{data.tickets.filter((ticket) => !closedStatuses.has(ticket.status) && ["Critical", "High"].includes(ticket.severity)).length}</b></div></div></div></article><article className="card type-report"><div className="section-heading"><div><span className="eyebrow">Scope clarity</span><h2>Feedback by type</h2></div></div><div className="bar-list">{types.map((type) => { const count = data.tickets.filter((ticket) => ticket.type === type).length; return <div key={type}><span><b>{type}</b><em>{count}</em></span><i><u style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></i></div>; })}</div></article><article className="card audit-report"><div className="section-heading"><div><span className="eyebrow">Evidence</span><h2>Acceptance trail</h2></div></div><div className="audit-table">{data.audit.map((event) => <div key={event.id}><span>{event.action}</span><b>{event.actor}</b><small>{event.details}</small><time>{formatDate(event.created_at, true)}</time></div>)}</div></article></div>;
}

function TicketDrawer({ ticket, project, release, comments, portal, close, runAction, busy }: { ticket: Ticket; project?: Project; release?: Release; comments: Comment[]; portal: "staff" | "client"; close: () => void; runAction: (action: string, payload: ActionPayload, success: string) => Promise<void>; busy: boolean }) {
  async function submitReply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const body = field(form, "body"); if (!body) return; await runAction("addComment", { ticketId: ticket.id, body, visibility: portal === "client" ? "public" : field(form, "visibility") || "public" }, "Reply added"); }
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="ticket-drawer"><header><div><span className="eyebrow">{ticket.key} · {project?.name}</span><h2>{ticket.title}</h2></div><button className="icon-button" onClick={close} aria-label="Close ticket">×</button></header><div className="drawer-body"><div className="ticket-badges"><span className={`type-pill ${ticket.type.toLowerCase().replace(" ", "-")}`}>{ticket.type}</span><span className={`severity-pill ${ticket.severity.toLowerCase()}`}>{ticket.severity} severity</span></div><section className="problem-section"><div><span>What happened</span><p>{ticket.actual}</p></div><div><span>Expected behaviour</span><p>{ticket.expected}</p></div></section>{ticket.attachment_key ? <a className="screenshot-link" href={`/api/uploads/${encodeURIComponent(ticket.attachment_key)}`} target="_blank" rel="noreferrer">View attached screenshot ↗</a> : null}<section className="ticket-properties"><label>Status<select disabled={busy || portal === "client"} value={ticket.status} onChange={(event) => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: event.target.value }, `Status changed to ${event.target.value}`)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label><label>Priority<select disabled={busy || portal === "client"} value={ticket.priority} onChange={(event) => runAction("updateTicket", { ticketId: ticket.id, field: "priority", value: event.target.value }, `Priority changed to ${event.target.value}`)}>{["Urgent", "High", "Normal", "Low"].map((priority) => <option key={priority}>{priority}</option>)}</select></label><label>Assignee<select disabled={busy || portal === "client"} value={ticket.assignee} onChange={(event) => runAction("updateTicket", { ticketId: ticket.id, field: "assignee", value: event.target.value }, `Assigned to ${event.target.value}`)}>{people.map((person) => <option key={person}>{person}</option>)}</select></label><label>Release<span>{release?.version} · {ticket.build}</span></label></section><section className="environment-box"><span>Captured context</span><dl><div><dt>Page</dt><dd>{ticket.page_url || "Not supplied"}</dd></div><div><dt>Browser</dt><dd>{ticket.browser || "Not supplied"}</dd></div><div><dt>Viewport</dt><dd>{ticket.viewport || "Not supplied"}</dd></div><div><dt>Reporter</dt><dd>{ticket.reporter}</dd></div></dl></section>{portal === "client" && ticket.status === "Ready for retest" ? <div className="retest-box"><div><span>✓</span><p><b>A fix is ready for you</b><small>Retest this issue in {release?.build} and confirm the result.</small></p></div><div><button className="secondary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Reopened" }, "Issue reopened for the delivery team")}>Still broken</button><button className="primary-button" onClick={() => runAction("updateTicket", { ticketId: ticket.id, field: "status", value: "Verified" }, "Fix verified — thank you")}>Verify fix</button></div></div> : null}<section className="conversation"><div className="section-heading"><div><span className="eyebrow">Conversation</span><h3>{comments.filter((comment) => portal === "staff" || comment.visibility === "public").length} updates</h3></div></div>{comments.filter((comment) => portal === "staff" || comment.visibility === "public").map((comment) => <div className={`comment ${comment.visibility}`} key={comment.id}><span className="comment-avatar">{initials(comment.author)}</span><div><p><b>{comment.author}</b>{comment.visibility === "internal" ? <em>Internal note</em> : null}<time>{formatDate(comment.created_at)}</time></p><div>{comment.body}</div></div></div>)}<form className="reply-box" onSubmit={submitReply}><textarea name="body" placeholder={portal === "client" ? "Add a reply for the delivery team…" : "Write an update…"} required />{portal === "staff" ? <label><input type="checkbox" name="visibility" value="internal" /> Internal note</label> : null}<button className="primary-button" disabled={busy}>Send update</button></form></section></div></aside></div>;
}

function ActionModal({ modal, data, portal, selectedRelease, close, runAction, busy }: { modal: Exclude<Modal, null>; data: Workspace; portal: "staff" | "client"; selectedRelease?: Release; close: () => void; runAction: (action: string, payload: ActionPayload, success: string) => Promise<void>; busy: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (modal === "client") return runAction("createClient", { name: field(form, "name"), contactName: field(form, "contactName"), contactEmail: field(form, "contactEmail"), accent: field(form, "accent") }, "Client workspace created");
    if (modal === "project") return runAction("createProject", { clientId: field(form, "clientId"), name: field(form, "name"), code: field(form, "code"), description: field(form, "description"), manager: field(form, "manager"), stage: "UAT", stagingUrl: field(form, "stagingUrl") }, "Project created");
    if (modal === "release") return runAction("createRelease", { projectId: field(form, "projectId"), name: field(form, "name"), version: field(form, "version"), build: field(form, "build"), startDate: field(form, "startDate"), dueDate: field(form, "dueDate"), testingNotes: field(form, "testingNotes"), checklist: field(form, "checklist").split("\n").filter(Boolean) }, "Release prepared");
    const file = form.get("screenshot"); let attachmentKey = "";
    if (file instanceof File && file.size) { const uploadData = new FormData(); uploadData.append("file", file); const upload = await fetch("/api/uploads", { method: "POST", body: uploadData }); const uploadBody = await upload.json() as { key?: string; error?: string }; if (!upload.ok || !uploadBody.key) throw new Error(uploadBody.error || "Screenshot upload failed"); attachmentKey = uploadBody.key; }
    const releaseId = field(form, "releaseId") || selectedRelease?.id || data.releases[0].id; const release = data.releases.find((item) => item.id === releaseId);
    await runAction("createTicket", { projectId: release?.project_id || data.projects[0].id, releaseId, type: field(form, "type"), title: field(form, "title"), actual: field(form, "actual"), expected: field(form, "expected"), severity: field(form, "severity"), reporter: portal === "client" ? "Maya Chen" : "Demo Operator", pageUrl: field(form, "pageUrl"), browser: navigator.userAgent.split(")")[0].split("(")[1] || navigator.userAgent, viewport: `${window.innerWidth} × ${window.innerHeight}`, build: release?.build || "", attachmentKey }, "Feedback submitted and delivery team notified");
  }
  const title = modal === "feedback" ? "Report feedback" : modal === "project" ? "Create project" : modal === "release" ? "Prepare a release" : "Add client";
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">DeliveryLoop</span><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close">×</button></header><form onSubmit={submit}>
    {modal === "feedback" ? <><label className="span-2">Release<select name="releaseId" defaultValue={selectedRelease?.id || data.releases[0].id}>{data.releases.filter((release) => portal === "staff" || release.project_id === "project-northstar").map((release) => <option key={release.id} value={release.id}>{data.projects.find((project) => project.id === release.project_id)?.name} · {release.version}</option>)}</select></label><label>Feedback type<select name="type" defaultValue="Bug"><option>Bug</option><option>Change request</option><option>Content</option><option>Question</option></select></label><label>Severity<select name="severity" defaultValue="Medium"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label><label className="span-2">Short title<input name="title" placeholder="Describe the issue in one sentence" required /></label><label className="span-2">What happened?<textarea name="actual" placeholder="Tell us what you saw and how you reached this screen" required /></label><label className="span-2">What did you expect?<textarea name="expected" placeholder="Describe the result you expected" required /></label><label className="span-2">Page or screen<input name="pageUrl" placeholder="/checkout/payment or a full staging URL" /></label><label className="span-2 upload-field">Screenshot<input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><span>Drop or choose a screenshot · PNG, JPG, WebP or GIF up to 8 MB</span></label></> : null}
    {modal === "client" ? <><label className="span-2">Company name<input name="name" required placeholder="Acme Limited" /></label><label>Primary contact<input name="contactName" required placeholder="Contact name" /></label><label>Email<input name="contactEmail" type="email" required placeholder="client@company.com" /></label><label className="span-2">Workspace accent<input name="accent" type="color" defaultValue="#625BF6" /></label></> : null}
    {modal === "project" ? <><label className="span-2">Client<select name="clientId">{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Project name<input name="name" required placeholder="Customer portal" /></label><label>Project code<input name="code" required maxLength={5} placeholder="CPT" /></label><label className="span-2">Purpose<textarea name="description" required placeholder="What is being delivered?" /></label><label>Project lead<input name="manager" required placeholder="Team member" /></label><label>Staging URL<input name="stagingUrl" type="url" placeholder="https://staging.example.com" /></label></> : null}
    {modal === "release" ? <><label className="span-2">Project<select name="projectId">{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="span-2">Release name<input name="name" required placeholder="Checkout & promotions UAT" /></label><label>Version<input name="version" required placeholder="v1.0" /></label><label>Build<input name="build" required placeholder="build-001" /></label><label>Testing starts<input name="startDate" type="date" required /></label><label>Testing due<input name="dueDate" type="date" required /></label><label className="span-2">Testing instructions<textarea name="testingNotes" required placeholder="What should the client focus on?" /></label><label className="span-2">Acceptance checklist<textarea name="checklist" required placeholder={"One acceptance flow per line\nGuest checkout\nPayment recovery\nEmail confirmation"} /></label></> : null}
    <footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : modal === "feedback" ? "Submit feedback" : "Save and continue"}</button></footer>
  </form></section></div>;
}
