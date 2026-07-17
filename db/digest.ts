import { queueNotificationEmail } from "../app/email";
import { ensureDatabase, isStaffRole } from "./workspace";

const OPEN_STATUSES = new Set(["Submitted", "Triaged", "In progress", "Needs information", "Approval required", "Ready for retest", "Reopened"]);

type DigestTicket = { key: string; title: string; status: string; assignee: string; reporter: string; project_id: string; client_id: string };
type DigestMember = { email: string; name: string; role: string; client_id: string | null };

function summarise(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Sends one morning email per member listing what is waiting on them, so
 * nothing depends on somebody remembering to open the workspace. Runs from the
 * scheduled cron trigger; recipients with nothing actionable get no email.
 */
export async function sendDailyDigests() {
  const db = await ensureDatabase();
  const [members, tickets] = await Promise.all([
    db.prepare("SELECT email,name,role,client_id FROM members WHERE active = '1'").all<DigestMember>(),
    db.prepare(`SELECT t.key, t.title, t.status, t.assignee, t.reporter, t.project_id, p.client_id
      FROM tickets t JOIN projects p ON p.id = t.project_id`).all<DigestTicket>(),
  ]);
  const open = tickets.results.filter((ticket) => OPEN_STATUSES.has(ticket.status));
  const today = new Date().toISOString().slice(0, 10);
  let queued = 0;

  for (const member of members.results) {
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
    } else if (["client_admin", "client_tester"].includes(member.role) && member.client_id) {
      const scoped = open.filter((ticket) => ticket.client_id === member.client_id);
      const retest = scoped.filter((ticket) => ticket.status === "Ready for retest");
      const info = scoped.filter((ticket) => ticket.status === "Needs information" && ticket.reporter === member.name);
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
