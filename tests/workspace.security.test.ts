import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import {
  type Actor,
  addComment,
  addChecklistItems,
  approveRelease,
  canAccessAttachment,
  createTicket,
  deleteOrphanUpload,
  editTicket,
  getWorkspace,
  removeChecklistItem,
  updateChecklist,
  updateRelease,
  updateTicket,
  withdrawTicket,
} from "../db/workspace";
import { insertMember, putUpload, seedTenant, staffActor } from "./helpers/fixtures";

async function checklistIdsFor(releaseId: string) {
  const rows = await env.DB.prepare("SELECT id FROM checklist_items WHERE release_id = ?")
    .bind(releaseId)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

async function passAllChecks(releaseId: string, actor: Actor) {
  for (const itemId of await checklistIdsFor(releaseId)) {
    await updateChecklist({ itemId, state: "Passed" }, actor);
  }
}

async function releaseStatus(releaseId: string) {
  const row = await env.DB.prepare("SELECT status, approved_by FROM releases WHERE id = ?")
    .bind(releaseId)
    .first<{ status: string; approved_by: string | null }>();
  return row;
}

describe("tenant isolation", () => {
  it("denies every cross-tenant mutation", async () => {
    const a = await seedTenant("Northstar", "NSC");
    const b = await seedTenant("Atlas", "ATL");
    const bChecklist = (await checklistIdsFor(b.releaseId))[0];

    await expect(
      updateChecklist({ itemId: bChecklist, state: "Passed" }, a.clientAdmin),
    ).rejects.toThrow();

    await expect(
      createTicket(
        {
          projectId: b.projectId,
          releaseId: b.releaseId,
          type: "Bug",
          severity: "Low",
          title: "Cross-tenant",
          actual: "x",
          expected: "y",
        },
        a.clientTester,
      ),
    ).rejects.toThrow();

    await expect(approveRelease({ releaseId: b.releaseId }, a.clientAdmin)).rejects.toThrow();

    await expect(
      addComment({ ticketId: b.ticketId, body: "Cross-tenant comment" }, a.clientAdmin),
    ).rejects.toThrow();

    await expect(
      editTicket(
        {
          ticketId: b.ticketId,
          type: "Bug",
          severity: "Low",
          title: "Hijacked",
          actual: "x",
          expected: "y",
        },
        a.clientAdmin,
      ),
    ).rejects.toThrow();

    await expect(withdrawTicket({ ticketId: b.ticketId }, a.clientAdmin)).rejects.toThrow();
  });

  it("leaks no row of another tenant into the workspace snapshot", async () => {
    const a = await seedTenant("Northstar", "NSC");
    const b = await seedTenant("Atlas", "ATL");

    const snapshot = await getWorkspace(a.clientAdmin);
    const foreignIds = new Set([b.clientId, b.projectId, b.releaseId, b.ticketId]);
    for (const id of await checklistIdsFor(b.releaseId)) foreignIds.add(id);

    // Assert over every collection by id intersection rather than spot checks,
    // so a newly added collection cannot quietly become a leak.
    for (const [name, rows] of Object.entries(snapshot as Record<string, unknown>)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const values = Object.values(row as Record<string, unknown>);
        for (const value of values) {
          if (typeof value === "string" && foreignIds.has(value)) {
            throw new Error(`collection "${name}" leaked ${value} from the other tenant`);
          }
        }
      }
    }
  });
});

describe("internal note confidentiality", () => {
  it("hides an internal comment's attachment from the client, in the snapshot and on retrieval", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const staff = staffActor("developer");
    await insertMember(staff);

    const internalKey = await putUpload("aaaaaaaa-1111-2222-3333-444444444444.png", staff.id);
    const publicKey = await putUpload("bbbbbbbb-1111-2222-3333-444444444444.png", staff.id);

    await addComment(
      {
        ticketId: tenant.ticketId,
        body: "Stack trace with another client's data",
        visibility: "internal",
        attachmentKey: internalKey,
      },
      staff,
    );
    await addComment(
      { ticketId: tenant.ticketId, body: "We are on it", attachmentKey: publicKey },
      staff,
    );

    const snapshot = await getWorkspace(tenant.clientTester);

    expect(snapshot.comments.map((comment) => comment.body)).not.toContain(
      "Stack trace with another client's data",
    );
    const visibleKeys = snapshot.attachments.map((attachment) => attachment.key);
    expect(visibleKeys).not.toContain(internalKey);
    expect(visibleKeys).toContain(publicKey);

    expect(await canAccessAttachment(internalKey, tenant.clientTester)).toBe(false);
    expect(await canAccessAttachment(publicKey, tenant.clientTester)).toBe(true);
    expect(await canAccessAttachment(internalKey, staff)).toBe(true);
  });
});

/**
 * The cleanup path behind DELETE /api/uploads/[key].
 *
 * The report form uploads screenshots in parallel and deletes the ones that
 * succeeded when a sibling fails, so that a failed submission does not leave
 * unreachable R2 objects behind. That gives the browser a delete verb pointed at
 * object storage, which is exactly the kind of endpoint that turns into
 * "delete any screenshot on any ticket" if it trusts the caller.
 *
 * Both gates are asserted here because either one alone is insufficient:
 * ownership without the reference check lets a reporter erase the evidence on
 * their own already-filed ticket, and the reference check without ownership lets
 * anyone delete anyone's pending upload. The route handler is a thin wrapper —
 * it resolves the actor, adds the same-origin check, and delegates here.
 */
describe("orphan upload deletion", () => {
  it("deletes only an unreferenced object owned by the caller", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const stranger = staffActor("developer");
    await insertMember(stranger);

    const mine = await putUpload("cccccccc-1111-2222-3333-444444444444.png", tenant.clientTester.id);
    const theirs = await putUpload("dddddddd-1111-2222-3333-444444444444.png", stranger.id);
    const attached = await putUpload("eeeeeeee-1111-2222-3333-444444444444.png", tenant.clientTester.id);
    const legacy = await putUpload("ffffffff-1111-2222-3333-444444444444.png", tenant.clientTester.id);

    // Referenced through the attachments table…
    // Same reason as the checklist input in the fixtures: an object literal
    // carrying a string[] cannot satisfy the Record<string, string> half.
    const withShot: Record<string, string> & { attachmentKeys?: string[] } = {
      projectId: tenant.projectId,
      releaseId: tenant.releaseId,
      type: "Bug",
      severity: "Medium",
      title: "Coupon total is stale",
      actual: "The discount stays on screen.",
      expected: "The total should reset.",
    };
    withShot.attachmentKeys = [attached];
    await createTicket(withShot, tenant.clientTester);
    // …and through the legacy tickets.attachment_key column, which predates it.
    await env.DB.prepare("UPDATE tickets SET attachment_key = ? WHERE id = ?")
      .bind(legacy, tenant.ticketId)
      .run();

    // Somebody else's pending upload: refused on ownership.
    await expect(deleteOrphanUpload(theirs, tenant.clientTester)).rejects.toThrow(
      "This screenshot belongs to another member",
    );
    // The caller's own screenshot, but it is on a ticket now: refused on reference.
    await expect(deleteOrphanUpload(attached, tenant.clientTester)).rejects.toThrow(
      "attached to feedback",
    );
    await expect(deleteOrphanUpload(legacy, tenant.clientTester)).rejects.toThrow(
      "attached to feedback",
    );
    // Staff are not exempt: the object belongs to whoever uploaded it.
    await expect(deleteOrphanUpload(mine, tenant.admin)).rejects.toThrow(
      "This screenshot belongs to another member",
    );

    for (const key of [theirs, attached, legacy, mine]) {
      expect(await env.UPLOADS.head(key), `${key} should still exist`).not.toBeNull();
    }

    // The one case the cleanup path exists for.
    expect(await deleteOrphanUpload(mine, tenant.clientTester)).toBe(true);
    expect(await env.UPLOADS.head(mine)).toBeNull();
  });

  it("refuses a key that does not look like one we minted, and shrugs at a missing object", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    await expect(deleteOrphanUpload("../../secrets.png", tenant.clientTester)).rejects.toThrow(
      "Invalid screenshot reference",
    );
    await expect(deleteOrphanUpload("00000000-0000-0000-0000-000000000000.exe", tenant.clientTester))
      .rejects.toThrow("Invalid screenshot reference");
    // Already gone: the browser retries this after a partial failure, so it has
    // to be idempotent rather than an error.
    expect(await deleteOrphanUpload("11111111-2222-3333-4444-555555555555.png", tenant.clientTester)).toBe(false);
  });

  it("refuses an object with no uploader recorded", async () => {
    // Deny by default: an object written by some other path carries no
    // uploadedBy, and "no owner" must never read as "anyone's".
    const tenant = await seedTenant("Northstar", "NSC");
    await env.UPLOADS.put("99999999-1111-2222-3333-444444444444.png", "fake-image-bytes");

    await expect(deleteOrphanUpload("99999999-1111-2222-3333-444444444444.png", tenant.clientTester))
      .rejects.toThrow("This screenshot belongs to another member");
    expect(await env.UPLOADS.head("99999999-1111-2222-3333-444444444444.png")).not.toBeNull();
  });
});

describe("approved releases are locked", () => {
  it("rejects every mutation once a release is approved", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);
    await approveRelease({ releaseId: tenant.releaseId, acknowledgeOpen: "1" }, tenant.clientAdmin);

    const itemId = (await checklistIdsFor(tenant.releaseId))[0];

    await expect(
      updateChecklist({ itemId, state: "Failed" }, tenant.clientAdmin),
    ).rejects.toThrow();

    await expect(removeChecklistItem({ itemId }, tenant.admin)).rejects.toThrow();

    const addInput: Record<string, string> & { checklist?: string[] } = {
      releaseId: tenant.releaseId,
    };
    addInput.checklist = ["Sneaky extra flow"];
    await expect(addChecklistItems(addInput, tenant.admin)).rejects.toThrow();

    await expect(
      updateRelease(
        {
          releaseId: tenant.releaseId,
          name: "Renamed after approval",
          version: "v9.9",
          build: "build-9",
          startDate: "2026-07-01",
          dueDate: "2026-07-31",
          testingNotes: "",
        },
        tenant.admin,
      ),
    ).rejects.toThrow();

    await expect(
      createTicket(
        {
          projectId: tenant.projectId,
          releaseId: tenant.releaseId,
          type: "Bug",
          severity: "Low",
          title: "Filed after sign-off",
          actual: "x",
          expected: "y",
        },
        tenant.clientTester,
      ),
    ).rejects.toThrow();
  });

  it("records exactly one approval when two run concurrently", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);

    const results = await Promise.allSettled([
      approveRelease({ releaseId: tenant.releaseId, exceptions: "First", acknowledgeOpen: "1" }, tenant.clientAdmin),
      approveRelease({ releaseId: tenant.releaseId, exceptions: "Second", acknowledgeOpen: "1", onBehalfOf: "Northstar Ltd" }, tenant.admin),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("does not let a second approval overwrite the recorded approver", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);

    await approveRelease({ releaseId: tenant.releaseId, exceptions: "Agreed", acknowledgeOpen: "1" }, tenant.clientAdmin);
    const first = await releaseStatus(tenant.releaseId);

    await expect(
      approveRelease({ releaseId: tenant.releaseId, exceptions: "Rewritten", acknowledgeOpen: "1", onBehalfOf: "Northstar Ltd" }, tenant.admin),
    ).rejects.toThrow();

    const after = await releaseStatus(tenant.releaseId);
    expect(after?.approved_by).toBe(first?.approved_by);
  });
});

describe("approval gate", () => {
  it("does not count a withdrawn blocker against approval", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);

    const blocker = await createTicket(
      {
        projectId: tenant.projectId,
        releaseId: tenant.releaseId,
        type: "Bug",
        severity: "Critical",
        title: "Wrong environment, my mistake",
        actual: "x",
        expected: "y",
      },
      tenant.clientTester,
    );
    await withdrawTicket({ ticketId: blocker.ticketId }, tenant.clientTester);

    // The UI treats Withdrawn as closed, so the gate must agree — otherwise the
    // approve button is enabled and the server 409s with no diagnostic.
    await approveRelease({ releaseId: tenant.releaseId, acknowledgeOpen: "1" }, tenant.clientAdmin);
    expect((await releaseStatus(tenant.releaseId))?.status).toBe("Approved");
  });
});

describe("ticket references", () => {
  it("allocates distinct sequential keys under concurrent submission", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    // The realistic failure: several testers submitting during one UAT window.
    // The old read-max-then-insert produced duplicate keys, and the loser's
    // report was lost behind a generic 500.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createTicket(
          {
            projectId: tenant.projectId,
            releaseId: tenant.releaseId,
            type: "Bug",
            severity: "Low",
            title: `Concurrent report ${index}`,
            actual: "x",
            expected: "y",
          },
          tenant.clientTester,
        ),
      ),
    );

    const keys = results.map((result) => result.key);
    expect(new Set(keys).size).toBe(10);
    // NSC-001 is the seeded ticket, so these continue from 002.
    expect([...keys].sort()).toEqual(
      Array.from({ length: 10 }, (_, index) => `NSC-${String(index + 2).padStart(3, "0")}`),
    );
  });
});

describe("client verification cannot be forged", () => {
  it("refuses to let staff set Verified directly", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await updateTicket(
      { ticketId: tenant.ticketId, field: "status", value: "Ready for retest" },
      tenant.admin,
    );

    await expect(
      updateTicket({ ticketId: tenant.ticketId, field: "status", value: "Verified" }, tenant.admin),
    ).rejects.toThrow();

    // The client may still verify their own fix.
    await updateTicket(
      { ticketId: tenant.ticketId, field: "status", value: "Verified" },
      tenant.clientTester,
    );
    const row = await env.DB.prepare("SELECT status FROM tickets WHERE id = ?")
      .bind(tenant.ticketId)
      .first<{ status: string }>();
    expect(row?.status).toBe("Verified");
  });
});

describe("authorization fails closed", () => {
  const PROJECT_MEMBERS_DDL = `CREATE TABLE IF NOT EXISTS \`project_members\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`project_id\` text NOT NULL,
    \`member_id\` text NOT NULL,
    \`added_by\` text DEFAULT '' NOT NULL,
    \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  afterEach(async () => {
    // Restore the table for the rest of the suite — beforeEach only truncates.
    await env.DB.prepare(PROJECT_MEMBERS_DDL).run();
    await env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS `project_members_project_member_idx` ON `project_members` (`project_id`,`member_id`)",
    ).run();
  });

  it("denies rather than allows when the team lookup errors", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const pm = staffActor("project_manager");
    await insertMember(pm);

    await env.DB.prepare("DROP TABLE project_members").run();

    // A transient failure of the authorization table must never read as
    // "this project has no team", which means open to every staff member.
    await expect(
      createTicket(
        {
          projectId: tenant.projectId,
          releaseId: tenant.releaseId,
          type: "Bug",
          severity: "Low",
          title: "Should not be allowed",
          actual: "x",
          expected: "y",
        },
        pm,
      ),
    ).rejects.toThrow();
  });
});
