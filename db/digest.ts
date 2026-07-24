import { queueNotificationEmail } from "../app/email";
import { ensureDatabase, isStaffRole } from "./workspace";

const OPEN_STATUSES = new Set(["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Reopened"]);
const DAY_MS = 86400000;

type DigestTicket = { key: string; title: string; status: string; assignee: string; reporter: string; reporter_id: string | null; project_id: string; client_id: string };
type DigestMember = { id: string; email: string; name: string; role: string; client_id: string | null; notify_mode: string | null };
type DigestRelease = { id: string; name: string; version: string; due_date: string; status: string; client_id: string };
type DigestCheck = { release_id: string; state: string };

function summarise(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

function daysUntil(dueDate: string, today: string) {
  const due = Date.parse(`${dueDate.slice(0, 10)}T12:00:00Z`);
  const now = Date.parse(`${today}T12:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return null;
  return Math.round((due - now) / DAY_MS);
}

/**
 * Sends one morning email per member listing what is waiting on them, so
 * nothing depends on somebody remembering to open the workspace. Runs from the
 * scheduled cron trigger; recipients with nothing actionable get no email.
 *
 * Membership is decided by `notify_mode`, not by role: the old role test copied
 * client admins and testers and silently excluded client viewers, so the
 * client's sponsor — the one person who has to answer "are we on track" — heard
 * nothing at all. Viewers now get release progress rather than per-ticket work,
 * because their question is not which tickets are open.
 */
export async function sendDailyDigests() {
  const db = await ensureDatabase();
  const [members, tickets, releases, checks] = await Promise.all([
    db.prepare("SELECT id,email,name,role,client_id,notify_mode FROM members WHERE active = '1'").all<DigestMember>(),
    db.prepare(`SELECT t.key, t.title, t.status, t.assignee, t.reporter, t.reporter_id, t.project_id, p.client_id
      FROM tickets t JOIN projects p ON p.id = t.project_id`).all<DigestTicket>(),
    db.prepare(`SELECT r.id, r.name, r.version, r.due_date, r.status, p.client_id
      FROM releases r JOIN projects p ON p.id = r.project_id
      WHERE r.status IN ('Testing','Retest')`).all<DigestRelease>(),
    db.prepare("SELECT release_id, state FROM checklist_items").all<DigestCheck>(),
  ]);
  const open = tickets.results.filter((ticket) => OPEN_STATUSES.has(ticket.status));
  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;

  for (const member of members.results) {
    if ((member.notify_mode || "standard") === "none") continue;
    let copy = "";
    if (isStaffRole(member.role)) {
      const assigned = open.filter((ticket) => ticket.assignee === member.name && !["Ready for retest", "Verified"].includes(ticket.status));
      const reopened = assigned.filter((ticket) => ticket.status === "Reopened").length;
      const untriaged = member.role === "developer" ? 0 : open.filter((ticket) => ticket.status === "Submitted").length;
      if (!assigned.length && !untriaged) continue;
      const lead = assigned.slice(0, 3).map((ticket) => `${ticket.key} “${ticket.title}”`).join(", ");
      copy = summarise([
        assigned.length ? `${assigned.length} feedback item${assigned.length === 1 ? " is" : "s are"} assigned to you${lead ? ` (${lead}${assigned.length > 3 ? ", …" : ""})` : ""}.` : "",
        reopened ? `${reopened} came back from client retest.` : "",
        untriaged ? `${untriaged} new item${untriaged === 1 ? " needs" : "s need"} triage.` : "",
      ]);
    } else if (member.role === "client_viewer" && member.client_id) {
      // A viewer cannot test or report, so a list of tickets is somebody else's
      // work. What they are accountable for is whether the release lands.
      const scopedReleases = releases.results.filter((release) => release.client_id === member.client_id);
      if (!scopedReleases.length) continue;
      const lines = scopedReleases.map((release) => {
        const flows = checks.results.filter((check) => check.release_id === release.id);
        const passed = flows.filter((check) => check.state === "Passed" || check.state === "Waived").length;
        const openCount = open.filter((ticket) => ticket.client_id === member.client_id).length;
        const left = daysUntil(release.due_date, today);
        const due = left === null ? "" : left < 0 ? ", testing window closed" : left === 0 ? ", due today" : `, due in ${left} day${left === 1 ? "" : "s"}`;
        return `${release.name} (${release.version}): ${passed} of ${flows.length} flows passed, ${openCount} open item${openCount === 1 ? "" : "s"}${due}.`;
      });
      copy = lines.join(" ");
    } else if (member.client_id) {
      const scoped = open.filter((ticket) => ticket.client_id === member.client_id);
      const retest = scoped.filter((ticket) => ticket.status === "Ready for retest");
      // Matched on the member id, not the display name: two people can share a
      // name, and the old match mailed whichever of them the loop reached.
      const info = scoped.filter((ticket) => ticket.status === "Needs information" && (ticket.reporter_id ? ticket.reporter_id === member.id : ticket.reporter === member.name));
      if (!retest.length && !info.length) continue;
      copy = summarise([
        retest.length ? `${retest.length} fix${retest.length === 1 ? " is" : "es are"} ready for your retest.` : "",
        info.length ? `${info.length} of your report${info.length === 1 ? "s" : "s"} need${info.length === 1 ? "s" : ""} more information.` : "",
      ]);
    } else {
      continue;
    }

    const sent = await queueNotificationEmail({
      recipients: [member.email],
      subject: "Your DeliveryLoop items for today",
      eyebrow: "DeliveryLoop daily digest",
      heading: "Waiting on you today",
      copy: `Good morning ${member.name}. ${copy}`,
      button: "Open workspace",
      path: "/",
      eventId: `digest:${today}:${member.email.toLowerCase()}`,
    });
    if (sent) queued += 1;
  }
  console.info(JSON.stringify({ event: "daily_digest_run", date: today, queued }));
}
