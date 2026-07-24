/**
 * Announcements — the one place the delivery team can say something to the
 * client that is not attached to a feedback item.
 *
 * Two producers write here: a project manager posting a note, and the release
 * lifecycle recording that testing opened. The lifecycle rows are evidence and
 * carry a `kind` other than "announcement", which is what makes them
 * undeletable — see `deleteAnnouncement` in `db/workspace.ts`.
 *
 * This module deliberately does not import `cloudflare:workers`: the database
 * arrives as a parameter so the release path can reuse it without
 * `db/workspace.ts` growing another responsibility.
 */

export type SystemAnnouncementInput = {
  clientId: string;
  projectId?: string;
  releaseId?: string;
  /** "announcement" for a human post; anything else is lifecycle evidence. */
  kind: string;
  title: string;
  body?: string;
  author: string;
  authorRole?: string;
};

/** Hard caps, mirrored by the dispatcher's validation for the human path. */
const TITLE_MAX = 140;
const BODY_MAX = 3000;

export async function createSystemAnnouncement(db: D1Database, input: SystemAnnouncementInput) {
  const announcementId = `announce-${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO announcements
    (id,client_id,project_id,release_id,kind,title,body,author,author_role)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(
      announcementId,
      input.clientId,
      input.projectId || "",
      input.releaseId || "",
      input.kind,
      input.title.slice(0, TITLE_MAX),
      (input.body || "").slice(0, BODY_MAX),
      input.author,
      input.authorRole || "",
    )
    .run();
  return announcementId;
}
