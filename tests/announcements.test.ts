import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  clientSideEmails,
  createAnnouncement,
  createTicket,
  deleteAnnouncement,
  getWorkspace,
  setReleaseStatus,
} from "../db/workspace";
import { insertMember, seedTenant, staffActor } from "./helpers/fixtures";

type AnnouncementRow = {
  id: string;
  client_id: string;
  project_id: string;
  release_id: string;
  kind: string;
  title: string;
  body: string;
  author: string;
  author_role: string;
};

async function announcementsFor(clientId: string) {
  const rows = await env.DB.prepare("SELECT * FROM announcements WHERE client_id = ? ORDER BY rowid ASC")
    .bind(clientId)
    .all<AnnouncementRow>();
  return rows.results;
}

describe("announcements", () => {
  it("reaches the client it was posted for and nobody else", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const other = await seedTenant("Atlas", "ATL");

    await createAnnouncement(
      {
        projectId: tenant.projectId,
        releaseId: tenant.releaseId,
        title: "Payments will be unavailable on Friday morning",
        body: "The payment provider is being switched over between 09:00 and 11:00. Please avoid checkout testing in that window.",
      },
      tenant.admin,
    );

    const mine = await getWorkspace(tenant.clientTester);
    expect(mine.announcements.some((row) => String(row.title).includes("Payments will be unavailable"))).toBe(true);

    // The whole point of a per-client feed is that it is per client.
    const theirs = await getWorkspace(other.clientTester);
    expect(theirs.announcements.some((row) => String(row.title).includes("Payments will be unavailable"))).toBe(false);
    expect(theirs.announcements.every((row) => row.client_id === other.clientId)).toBe(true);

    // A read-only viewer is exactly the person an announcement is aimed at.
    const viewer = await getWorkspace(tenant.clientViewer);
    expect(viewer.announcements.some((row) => String(row.title).includes("Payments will be unavailable"))).toBe(true);
  });

  it("derives the client from the project and ignores a forged one in the payload", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const other = await seedTenant("Atlas", "ATL");

    await createAnnouncement(
      {
        projectId: tenant.projectId,
        // A caller with legitimate access to their own project must not be able
        // to address another tenant's feed by naming its client id.
        clientId: other.clientId,
        title: "Posted with a forged client id",
      },
      tenant.admin,
    );

    expect((await announcementsFor(tenant.clientId)).some((row) => row.title === "Posted with a forged client id")).toBe(true);
    expect((await announcementsFor(other.clientId)).some((row) => row.title === "Posted with a forged client id")).toBe(false);
    const leaked = await getWorkspace(other.clientAdmin);
    expect(leaked.announcements.some((row) => row.title === "Posted with a forged client id")).toBe(false);
  });

  it("refuses a release from another project, and any role below project manager", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const other = await seedTenant("Atlas", "ATL");
    const developer = staffActor("developer");
    await insertMember(developer);

    await expect(
      createAnnouncement({ projectId: tenant.projectId, releaseId: other.releaseId, title: "Cross-project release" }, tenant.admin),
    ).rejects.toThrow(/does not belong to this project/i);

    for (const actor of [developer, tenant.clientAdmin, tenant.clientTester]) {
      await expect(
        createAnnouncement({ projectId: tenant.projectId, title: "Not yours to post" }, actor),
      ).rejects.toThrow();
    }
    expect(await announcementsFor(tenant.clientId)).toHaveLength(1); // only the lifecycle notice
  });

  it("posts a testing_open notice when a release opens, and a retest_open one on the next build", async () => {
    // seedTenant opens its release for testing, which is what should announce.
    const tenant = await seedTenant("Northstar", "NSC");

    const opened = (await announcementsFor(tenant.clientId)).find((row) => row.kind === "testing_open");
    expect(opened).toBeTruthy();
    expect(opened?.release_id).toBe(tenant.releaseId);
    expect(opened?.project_id).toBe(tenant.projectId);
    expect(opened?.title).toMatch(/Testing is open/i);
    // The body is the promise the client's empty state makes: when the window
    // closes and where the instructions are.
    expect(opened?.body).toMatch(/2026-07-01 to 2026-07-31/);
    expect(opened?.body).toMatch(/instructions/i);
    expect(opened?.author).toBe(tenant.admin.name);

    await setReleaseStatus({ releaseId: tenant.releaseId, status: "Retest", build: "build-2" }, tenant.admin);
    const retest = (await announcementsFor(tenant.clientId)).find((row) => row.kind === "retest_open");
    expect(retest?.title).toMatch(/ready to retest/i);

    // And the client can actually read both of them back.
    const workspace = await getWorkspace(tenant.clientTester);
    expect(workspace.announcements.filter((row) => String(row.kind).endsWith("_open"))).toHaveLength(2);
  });

  it("will not delete a lifecycle notice, and only lets the author withdraw their own post", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const manager = staffActor("project_manager", { id: "member-pm-one", name: "Priya Manager", email: "priya@altrdtech.com" });
    const otherManager = staffActor("project_manager", { id: "member-pm-two", name: "Devan Manager", email: "devan@altrdtech.com" });
    await insertMember(manager);
    await insertMember(otherManager);

    const lifecycle = (await announcementsFor(tenant.clientId)).find((row) => row.kind === "testing_open");
    await expect(
      deleteAnnouncement({ announcementId: lifecycle?.id || "" }, tenant.admin),
    ).rejects.toThrow(/cannot be removed/i);
    expect((await announcementsFor(tenant.clientId)).some((row) => row.id === lifecycle?.id)).toBe(true);

    const posted = await createAnnouncement(
      { projectId: tenant.projectId, title: "Staging will be redeployed tonight" },
      manager,
    );
    // Another project manager did not write it, so it is not theirs to withdraw.
    await expect(
      deleteAnnouncement({ announcementId: posted }, otherManager),
    ).rejects.toThrow(/only remove an announcement you posted/i);
    await expect(
      deleteAnnouncement({ announcementId: posted }, tenant.clientAdmin),
    ).rejects.toThrow();

    await deleteAnnouncement({ announcementId: posted }, manager);
    expect((await announcementsFor(tenant.clientId)).some((row) => row.id === posted)).toBe(false);
  });
});

describe("notification defaults", () => {
  it("stamps the reporter's member id on new feedback", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const row = await env.DB.prepare("SELECT reporter, reporter_id FROM tickets WHERE id = ?")
      .bind(tenant.ticketId)
      .first<{ reporter: string; reporter_id: string }>();
    expect(row?.reporter).toBe(tenant.clientTester.name);
    // Display names are neither unique nor stable; routing matches on the id.
    expect(row?.reporter_id).toBe(tenant.clientTester.id);
  });

  it("stops copying a client admin on every comment while still mailing the reporter", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const reporterId = tenant.clientTester.id;

    // The spam this fixes: a client admin used to be emailed about every ticket
    // and every reply anywhere in their tenant.
    const onComment = await clientSideEmails(env.DB, tenant.clientId, reporterId, "comment", tenant.admin.email);
    expect(onComment).toContain(tenant.clientTester.email);
    expect(onComment).not.toContain(tenant.clientAdmin.email);

    // New feedback is the one per-ticket event a client admin still hears about.
    const onCreated = await clientSideEmails(env.DB, tenant.clientId, reporterId, "created", tenant.admin.email);
    expect(onCreated).toContain(tenant.clientAdmin.email);

    // A viewer defaults to the digest, so no per-item mail either way.
    expect(onComment).not.toContain(tenant.clientViewer.email);
    expect(onCreated).not.toContain(tenant.clientViewer.email);
  });

  it("sends announcements and acceptance mail to everyone who has not opted out", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    const broadcast = await clientSideEmails(env.DB, tenant.clientId, "", "broadcast", tenant.admin.email);
    expect(broadcast).toContain(tenant.clientAdmin.email);
    expect(broadcast).toContain(tenant.clientTester.email);
    // The sponsor who used to hear nothing at all.
    expect(broadcast).toContain(tenant.clientViewer.email);

    await env.DB.prepare("UPDATE members SET notify_mode = 'none' WHERE id = ?").bind(tenant.clientTester.id).run();
    const afterOptOut = await clientSideEmails(env.DB, tenant.clientId, "", "broadcast", tenant.admin.email);
    expect(afterOptOut).not.toContain(tenant.clientTester.email);
  });

  it("honours an explicit all mode and never mails another tenant", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const other = await seedTenant("Atlas", "ATL");
    await env.DB.prepare("UPDATE members SET notify_mode = 'all' WHERE id = ?").bind(tenant.clientAdmin.id).run();

    const onComment = await clientSideEmails(env.DB, tenant.clientId, tenant.clientTester.id, "comment", tenant.admin.email);
    expect(onComment).toContain(tenant.clientAdmin.email);
    expect(onComment).not.toContain(other.clientAdmin.email);
    expect(onComment).not.toContain(other.clientTester.email);
  });

  it("routes a second reporter's mail to that reporter, not the first", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const second = await createTicket(
      {
        projectId: tenant.projectId,
        releaseId: tenant.releaseId,
        type: "Question",
        severity: "Low",
        title: "Filed by the client admin",
        actual: "x",
        expected: "y",
      },
      tenant.clientAdmin,
    );
    const row = await env.DB.prepare("SELECT reporter_id FROM tickets WHERE id = ?")
      .bind(second.ticketId)
      .first<{ reporter_id: string }>();

    const recipients = await clientSideEmails(env.DB, tenant.clientId, row?.reporter_id || "", "retest", tenant.admin.email);
    expect(recipients).toContain(tenant.clientAdmin.email);
    expect(recipients).not.toContain(tenant.clientTester.email);
  });
});
