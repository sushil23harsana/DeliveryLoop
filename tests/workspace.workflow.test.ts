import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  type Actor,
  approveRelease,
  carryForwardTickets,
  createAnnouncement,
  createRelease,
  createTicket,
  getWorkspace,
  setReleaseStatus,
  updateChecklist,
  updateProject,
  updateRelease,
  updateTicket,
} from "../db/workspace";
import { insertMember, seedTenant, staffActor } from "./helpers/fixtures";

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

async function approvalFor(releaseId: string) {
  return env.DB.prepare("SELECT * FROM release_approvals WHERE release_id = ?")
    .bind(releaseId)
    .first<Record<string, string | number>>();
}

/** The next release in the same project, already open for testing. */
async function nextRelease(projectId: string, actor: Actor, version = "v2.0") {
  const input: Record<string, string> & { checklist?: string[] } = {
    projectId,
    name: `Round ${version}`,
    version,
    build: `build-${version}`,
    startDate: "2026-08-01",
    dueDate: "2026-08-31",
    testingNotes: "Re-check the carried items.",
    openNow: "1",
  };
  input.checklist = ["Second round flow"];
  return createRelease(input, actor);
}

// Same reason as the checklist input in the fixtures: an object literal carrying
// a string[] cannot satisfy the Record<string, string> half of the intersection.
function carryInput(fields: Record<string, string>, ticketIds: string[]) {
  const input: Record<string, string> & { ticketIds?: string[] } = { ...fields };
  input.ticketIds = ticketIds;
  return input;
}

async function ticketRow(ticketId: string) {
  return env.DB.prepare("SELECT release_id, build, status FROM tickets WHERE id = ?")
    .bind(ticketId)
    .first<{ release_id: string; build: string; status: string }>();
}

describe("acceptance evidence is durable", () => {
  it("writes an approval record carrying the exceptions and both snapshots", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);

    await approveRelease(
      {
        releaseId: tenant.releaseId,
        exceptions: "Delivery estimate copy agreed for the next release",
        acknowledgeOpen: "1",
      },
      tenant.clientAdmin,
    );

    const approval = await approvalFor(tenant.releaseId);
    expect(approval?.exceptions).toBe("Delivery estimate copy agreed for the next release");
    expect(approval?.approved_by).toBe(tenant.clientAdmin.name);
    expect(approval?.approved_by_role).toBe("client_admin");
    expect(approval?.checklist_total).toBe(2);
    expect(approval?.checklist_passed).toBe(2);

    // The seeded Medium ticket is still open at sign-off and must be recorded,
    // because it can later be carried to another release and would otherwise
    // vanish from this release's acceptance report.
    const openItems = JSON.parse(String(approval?.open_items)) as { key: string }[];
    expect(openItems.map((item) => item.key)).toContain(tenant.ticketKey);

    const snapshot = JSON.parse(String(approval?.checklist_snapshot)) as { state: string }[];
    expect(snapshot).toHaveLength(2);
    expect(snapshot.every((row) => row.state === "Passed")).toBe(true);
  });

  it("survives the audit log being emptied", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);
    await approveRelease(
      { releaseId: tenant.releaseId, exceptions: "Signed with two known gaps", acknowledgeOpen: "1" },
      tenant.clientAdmin,
    );

    // Exceptions used to live only in audit_events.details and were read back by
    // string-matching, so they disappeared once the audit read window moved past.
    await env.DB.prepare("DELETE FROM audit_events").run();

    const approval = await approvalFor(tenant.releaseId);
    expect(approval?.exceptions).toBe("Signed with two known gaps");
  });

  it("requires open items to be acknowledged, and a staff approver to say who they act for", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);

    await expect(
      approveRelease({ releaseId: tenant.releaseId }, tenant.clientAdmin),
    ).rejects.toThrow(/open item/i);

    await expect(
      approveRelease({ releaseId: tenant.releaseId, acknowledgeOpen: "1" }, tenant.admin),
    ).rejects.toThrow(/on behalf of/i);
  });
});

describe("carrying open feedback forward", () => {
  it("moves the ticket onto the next release, stamps its build and audits both releases", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const target = await nextRelease(tenant.projectId, tenant.admin);

    await carryForwardTickets(
      carryInput({ releaseId: tenant.releaseId, disposition: "move", targetReleaseId: target }, [tenant.ticketId]),
      tenant.admin,
    );

    const ticket = await ticketRow(tenant.ticketId);
    expect(ticket?.release_id).toBe(target);
    expect(ticket?.build).toBe("build-v2.0");
    // Carrying an item forward is not a decision about it — its status is
    // untouched so the next round starts where the last one left off.
    expect(ticket?.status).toBe("Submitted");

    const events = await env.DB.prepare(
      "SELECT entity_id, action FROM audit_events WHERE entity_type = 'release' AND action LIKE 'Open items%'",
    ).all<{ entity_id: string; action: string }>();
    expect(events.results.map((row) => row.entity_id).sort()).toEqual([tenant.releaseId, target].sort());

    const perTicket = await env.DB.prepare(
      "SELECT details FROM audit_events WHERE entity_type = 'ticket' AND action = 'Carried forward'",
    ).first<{ details: string }>();
    expect(perTicket?.details).toMatch(/v1\.0 to v2\.0/);
  });

  it("keeps a carried ticket in the prior approval's open-items snapshot", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await passAllChecks(tenant.releaseId, tenant.admin);
    await approveRelease(
      { releaseId: tenant.releaseId, exceptions: "One item carried to v2.0", acknowledgeOpen: "1" },
      tenant.clientAdmin,
    );
    const target = await nextRelease(tenant.projectId, tenant.admin);

    await carryForwardTickets(
      carryInput({ releaseId: tenant.releaseId, disposition: "move", targetReleaseId: target }, [tenant.ticketId]),
      tenant.admin,
    );

    // The report selects live tickets by release_id, so without the snapshot the
    // carried item would silently disappear from a document already signed.
    const approval = await approvalFor(tenant.releaseId);
    const openItems = JSON.parse(String(approval?.open_items)) as { key: string }[];
    expect(openItems.map((item) => item.key)).toContain(tenant.ticketKey);
    expect((await ticketRow(tenant.ticketId))?.release_id).toBe(target);
  });

  it("refuses an approved target release", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const target = await nextRelease(tenant.projectId, tenant.admin);
    await passAllChecks(target, tenant.admin);
    await approveRelease({ releaseId: target, acknowledgeOpen: "1" }, tenant.clientAdmin);

    await expect(
      carryForwardTickets(
        carryInput({ releaseId: tenant.releaseId, disposition: "move", targetReleaseId: target }, [tenant.ticketId]),
        tenant.admin,
      ),
    ).rejects.toThrow(/approved release is locked/i);

    expect((await ticketRow(tenant.ticketId))?.release_id).toBe(tenant.releaseId);
  });

  it("refuses a target release in another project", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const other = await seedTenant("Atlas", "ATL");

    await expect(
      carryForwardTickets(
        carryInput({ releaseId: tenant.releaseId, disposition: "move", targetReleaseId: other.releaseId }, [tenant.ticketId]),
        tenant.admin,
      ),
    ).rejects.toThrow(/same project/i);

    expect((await ticketRow(tenant.ticketId))?.release_id).toBe(tenant.releaseId);
  });

  it("defers by agreement without moving the ticket", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    await carryForwardTickets(
      carryInput({ releaseId: tenant.releaseId, disposition: "defer", note: "Agreed for the next phase" }, [tenant.ticketId]),
      tenant.admin,
    );

    const ticket = await ticketRow(tenant.ticketId);
    // "Agreed not to fix" when there is no next release yet: the item stays on
    // the release it was reported against and stops blocking acceptance.
    expect(ticket?.status).toBe("Deferred");
    expect(ticket?.release_id).toBe(tenant.releaseId);

    await expect(
      carryForwardTickets(
        carryInput({ releaseId: tenant.releaseId, disposition: "defer" }, [tenant.ticketId]),
        tenant.admin,
      ),
    ).rejects.toThrow(/only open feedback/i);
  });

  it("caps a single carry-forward at 60 items and refuses ids from another release", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const target = await nextRelease(tenant.projectId, tenant.admin);

    await expect(
      carryForwardTickets(
        carryInput(
          { releaseId: tenant.releaseId, disposition: "move", targetReleaseId: target },
          Array.from({ length: 61 }, (_, index) => `ticket-${index}`),
        ),
        tenant.admin,
      ),
    ).rejects.toThrow(/at most 60/i);

    // Already on the target, so it is not "currently on releaseId".
    const stray = await createTicket(
      {
        projectId: tenant.projectId,
        releaseId: target,
        type: "Bug",
        severity: "Low",
        title: "Filed against the second round",
        actual: "x",
        expected: "y",
      },
      tenant.clientTester,
    );
    await expect(
      carryForwardTickets(
        carryInput({ releaseId: tenant.releaseId, disposition: "move", targetReleaseId: target }, [stray.ticketId]),
        tenant.admin,
      ),
    ).rejects.toThrow(/still sit on this release/i);
  });

  it("is closed to developers and to the client", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const target = await nextRelease(tenant.projectId, tenant.admin);
    const developer = staffActor("developer");
    await insertMember(developer);

    for (const actor of [developer, tenant.clientAdmin, tenant.clientTester]) {
      await expect(
        carryForwardTickets(
          carryInput({ releaseId: tenant.releaseId, disposition: "move", targetReleaseId: target }, [tenant.ticketId]),
          actor,
        ),
      ).rejects.toThrow();
    }
    expect((await ticketRow(tenant.ticketId))?.release_id).toBe(tenant.releaseId);
  });
});

describe("waived acceptance items", () => {
  it("lets a descoped item be waived with a reason instead of falsely passed", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const [first, second] = await checklistIdsFor(tenant.releaseId);

    await updateChecklist({ itemId: first, state: "Passed" }, tenant.clientTester);
    await updateChecklist({ itemId: second, state: "Failed" }, tenant.clientTester);

    // A Failed item can never be removed, so without a waiver the only way to
    // approve was to flip it to Passed — falsifying the acceptance evidence.
    await expect(
      approveRelease({ releaseId: tenant.releaseId, acknowledgeOpen: "1" }, tenant.clientAdmin),
    ).rejects.toThrow(/waive/i);

    await updateChecklist(
      { itemId: second, state: "Waived", note: "Multi-currency deferred by agreement" },
      tenant.clientAdmin,
    );
    await approveRelease({ releaseId: tenant.releaseId, acknowledgeOpen: "1" }, tenant.clientAdmin);

    const approval = await approvalFor(tenant.releaseId);
    expect(approval?.checklist_passed).toBe(1);
    expect(approval?.checklist_waived).toBe(1);
    const snapshot = JSON.parse(String(approval?.checklist_snapshot)) as {
      state: string;
      state_note: string;
    }[];
    expect(snapshot.find((row) => row.state === "Waived")?.state_note).toBe(
      "Multi-currency deferred by agreement",
    );
  });

  it("refuses a waiver without a reason, and from a tester", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const [itemId] = await checklistIdsFor(tenant.releaseId);

    await expect(
      updateChecklist({ itemId, state: "Waived", note: "nope" }, tenant.clientAdmin),
    ).rejects.toThrow(/at least 10 characters/i);

    await expect(
      updateChecklist(
        { itemId, state: "Waived", note: "Deferred by agreement with the client" },
        tenant.clientTester,
      ),
    ).rejects.toThrow(/administrator or project manager/i);
  });

  it("records who moved an acceptance item and when", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const [itemId] = await checklistIdsFor(tenant.releaseId);

    await updateChecklist({ itemId, state: "Passed" }, tenant.clientTester);

    const row = await env.DB.prepare(
      "SELECT state_by, state_at FROM checklist_items WHERE id = ?",
    )
      .bind(itemId)
      .first<{ state_by: string; state_at: string | null }>();

    // Without attribution the report cannot distinguish a client passing a flow
    // from the agency passing it on their behalf.
    expect(row?.state_by).toBe(tenant.clientTester.name);
    expect(row?.state_at).toBeTruthy();
  });
});

describe("release lifecycle", () => {
  it("opens a release for testing and hides drafts from the client", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    // seedTenant files a ticket, so the release is already open. Make a second,
    // genuinely draft release to prove Preparing is invisible to the client.
    const draft = await env.DB.prepare(
      "INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id",
    )
      .bind("release-draft", tenant.projectId, "Draft", "v2.0", "build-2", "Preparing", "2026-08-01", "2026-08-31", "")
      .first<{ id: string }>();
    await env.DB.prepare("INSERT INTO checklist_items (id,release_id,title) VALUES (?,?,?)")
      .bind("check-draft", draft?.id, "Second round flow")
      .run();

    const beforeOpen = await getWorkspace(tenant.clientTester);
    expect(beforeOpen.releases.map((release) => release.id)).not.toContain("release-draft");

    await setReleaseStatus({ releaseId: "release-draft", status: "Testing" }, tenant.admin);

    const afterOpen = await getWorkspace(tenant.clientTester);
    expect(afterOpen.releases.map((release) => release.id)).toContain("release-draft");
    // The checklist must follow the release, or the client sees a release with
    // nothing to accept.
    expect(afterOpen.checklist.map((item) => item.id)).toContain("check-draft");
  });

  it("refuses to open a release that has nothing to accept", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await env.DB.prepare(
      "INSERT INTO releases (id,project_id,name,version,build,status,start_date,due_date,testing_notes) VALUES (?,?,?,?,?,?,?,?,?)",
    )
      .bind("release-empty", tenant.projectId, "Empty", "v3.0", "build-3", "Preparing", "2026-08-01", "2026-08-31", "")
      .run();

    await expect(
      setReleaseStatus({ releaseId: "release-empty", status: "Testing" }, tenant.admin),
    ).rejects.toThrow(/acceptance flow/i);
  });

  it("rejects illegal transitions and treats approval as final", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    // The seeded release is already Testing (it has feedback against it).
    await expect(
      setReleaseStatus({ releaseId: tenant.releaseId, status: "Approved" }, tenant.admin),
    ).rejects.toThrow();

    // Cannot be hidden again once the client has filed feedback.
    await expect(
      setReleaseStatus({ releaseId: tenant.releaseId, status: "Preparing" }, tenant.admin),
    ).rejects.toThrow(/already has feedback/i);

    await updateChecklist({ itemId: (await env.DB.prepare("SELECT id FROM checklist_items WHERE release_id = ? LIMIT 1").bind(tenant.releaseId).first<{ id: string }>())?.id || "", state: "Passed" }, tenant.admin);
    await env.DB.prepare("UPDATE checklist_items SET state = 'Passed' WHERE release_id = ?").bind(tenant.releaseId).run();
    await approveRelease({ releaseId: tenant.releaseId, acknowledgeOpen: "1" }, tenant.clientAdmin);

    await expect(
      setReleaseStatus({ releaseId: tenant.releaseId, status: "Testing" }, tenant.admin),
    ).rejects.toThrow(/final/i);
  });

  it("only lets administrators and project managers move a release", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const developer = staffActor("developer");
    await insertMember(developer);

    await expect(
      setReleaseStatus({ releaseId: tenant.releaseId, status: "Retest" }, developer),
    ).rejects.toThrow();
    await expect(
      setReleaseStatus({ releaseId: tenant.releaseId, status: "Retest" }, tenant.clientAdmin),
    ).rejects.toThrow();
  });

  it("lets a client report against a release that is open for retest", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await setReleaseStatus({ releaseId: tenant.releaseId, status: "Retest", build: "build-2" }, tenant.admin);

    const ticket = await createTicket(
      {
        projectId: tenant.projectId,
        releaseId: tenant.releaseId,
        type: "Bug",
        severity: "Low",
        title: "Still wrong after the new build",
        actual: "x",
        expected: "y",
      },
      tenant.clientTester,
    );
    expect(ticket.key).toBe("NSC-002");

    const release = await env.DB.prepare("SELECT status, build FROM releases WHERE id = ?")
      .bind(tenant.releaseId)
      .first<{ status: string; build: string }>();
    expect(release?.status).toBe("Retest");
    expect(release?.build).toBe("build-2");
  });
});

describe("reopening after a failed retest", () => {
  async function readyForRetest(ticketId: string, actor: Actor) {
    await updateTicket({ ticketId, field: "status", value: "Ready for retest" }, actor);
  }

  it("refuses a client reopen with no reason, or a token one", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await readyForRetest(tenant.ticketId, tenant.admin);

    // A bare status flip told the team only that the fix had failed, so they had
    // to go back and ask what was still wrong.
    await expect(
      updateTicket({ ticketId: tenant.ticketId, field: "status", value: "Reopened" }, tenant.clientTester),
    ).rejects.toThrow(/at least 10 characters/i);

    await expect(
      updateTicket({ ticketId: tenant.ticketId, field: "status", value: "Reopened", note: "broken" }, tenant.clientTester),
    ).rejects.toThrow(/at least 10 characters/i);

    const ticket = await env.DB.prepare("SELECT status FROM tickets WHERE id = ?")
      .bind(tenant.ticketId)
      .first<{ status: string }>();
    expect(ticket?.status).toBe("Ready for retest");
  });

  it("accepts a reason and publishes it as a public comment plus audit detail", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await readyForRetest(tenant.ticketId, tenant.admin);

    await updateTicket(
      {
        ticketId: tenant.ticketId,
        field: "status",
        value: "Reopened",
        note: "The pay button works on desktop but still does nothing on iPhone Safari.",
      },
      tenant.clientTester,
    );

    const ticket = await env.DB.prepare("SELECT status FROM tickets WHERE id = ?")
      .bind(tenant.ticketId)
      .first<{ status: string }>();
    expect(ticket?.status).toBe("Reopened");

    // Ordered by rowid, not created_at: CURRENT_TIMESTAMP has one-second
    // granularity and everything here happens inside the same second.
    const comment = await env.DB.prepare(
      "SELECT author, body, visibility FROM comments WHERE ticket_id = ? ORDER BY rowid DESC LIMIT 1",
    )
      .bind(tenant.ticketId)
      .first<{ author: string; body: string; visibility: string }>();
    expect(comment?.author).toBe(tenant.clientTester.name);
    expect(comment?.body).toMatch(/iPhone Safari/);
    // Public, or the person who has to act on it cannot read it.
    expect(comment?.visibility).toBe("public");

    const event = await env.DB.prepare(
      "SELECT details FROM audit_events WHERE entity_id = ? AND action = 'status changed' ORDER BY rowid DESC LIMIT 1",
    )
      .bind(tenant.ticketId)
      .first<{ details: string }>();
    expect(event?.details).toMatch(/^Reopened — /);
    expect(event?.details).toMatch(/iPhone Safari/);

    // The client can read their own reply back.
    const workspace = await getWorkspace(tenant.clientTester);
    expect(workspace.comments.some((row) => String(row.body).includes("iPhone Safari"))).toBe(true);
  });

  it("does not force staff to justify a reopen", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    await readyForRetest(tenant.ticketId, tenant.admin);

    await updateTicket({ ticketId: tenant.ticketId, field: "status", value: "Reopened" }, tenant.admin);
    const ticket = await env.DB.prepare("SELECT status FROM tickets WHERE id = ?")
      .bind(tenant.ticketId)
      .first<{ status: string }>();
    expect(ticket?.status).toBe("Reopened");
  });
});

describe("test credentials on a release", () => {
  it("round-trips through create and update, and reaches the client", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    const releaseInput: Record<string, string> & { checklist?: string[] } = {
      projectId: tenant.projectId,
      name: "Second round",
      version: "v2.0",
      build: "build-2",
      startDate: "2026-08-01",
      dueDate: "2026-08-31",
      testingNotes: "Check the new payment provider.",
      testCredentials: "Username: uat.tester@example.com\nPassword: uat-only-2026",
      openNow: "1",
    };
    releaseInput.checklist = ["Card payment succeeds"];
    const releaseId = await createRelease(releaseInput, tenant.admin);

    const created = await env.DB.prepare("SELECT test_credentials FROM releases WHERE id = ?")
      .bind(releaseId)
      .first<{ test_credentials: string }>();
    expect(created?.test_credentials).toBe("Username: uat.tester@example.com\nPassword: uat-only-2026");

    await updateRelease(
      {
        releaseId,
        name: "Second round",
        version: "v2.0",
        build: "build-3",
        startDate: "2026-08-01",
        dueDate: "2026-08-31",
        testingNotes: "Check the new payment provider.",
        testCredentials: "Username: uat.tester@example.com\nPassword: rotated-2026",
      },
      tenant.admin,
    );

    const updated = await env.DB.prepare("SELECT test_credentials FROM releases WHERE id = ?")
      .bind(releaseId)
      .first<{ test_credentials: string }>();
    expect(updated?.test_credentials).toBe("Username: uat.tester@example.com\nPassword: rotated-2026");

    // The audit trail records that the account details moved, never their value.
    const event = await env.DB.prepare(
      "SELECT details FROM audit_events WHERE entity_id = ? AND action = 'Release updated' ORDER BY rowid DESC LIMIT 1",
    )
      .bind(releaseId)
      .first<{ details: string }>();
    expect(event?.details).toMatch(/test account details/i);
    expect(event?.details).not.toMatch(/rotated-2026/);

    // The whole point is that the tester can read them without asking anyone.
    const workspace = await getWorkspace(tenant.clientTester);
    const clientRelease = workspace.releases.find((row) => row.id === releaseId);
    expect(clientRelease?.test_credentials).toBe("Username: uat.tester@example.com\nPassword: rotated-2026");
  });

  it("defaults to empty when the team does not supply one", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const release = await env.DB.prepare("SELECT test_credentials FROM releases WHERE id = ?")
      .bind(tenant.releaseId)
      .first<{ test_credentials: string }>();
    expect(release?.test_credentials).toBe("");
  });
});

describe("client-visible checklist history", () => {
  it("shows the client who moved an acceptance flow on their own release", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const [itemId] = await checklistIdsFor(tenant.releaseId);
    await updateChecklist({ itemId, state: "Passed" }, tenant.clientTester);

    const workspace = await getWorkspace(tenant.clientTester);
    expect(workspace.audit.some((event) => event.entity_type === "checklist" && event.entity_id === itemId)).toBe(true);

    // Another tenant's checklist events stay invisible.
    const other = await seedTenant("Atlas", "ATL");
    const [otherItemId] = await checklistIdsFor(other.releaseId);
    await updateChecklist({ itemId: otherItemId, state: "Passed" }, other.clientTester);
    const rescoped = await getWorkspace(tenant.clientTester);
    expect(rescoped.audit.some((event) => event.entity_id === otherItemId)).toBe(false);
  });
});

describe("project editing", () => {
  it("lets a mistyped project be corrected without touching its code", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    await updateProject(
      {
        projectId: tenant.projectId,
        name: "Northstar Commerce Portal",
        manager: "Aarav Patel",
        description: "Checkout and promotions",
        stage: "UAT",
        stagingUrl: "https://staging.northstar.test",
      },
      tenant.admin,
    );

    const project = await env.DB.prepare("SELECT name, manager, staging_url, code FROM projects WHERE id = ?")
      .bind(tenant.projectId)
      .first<{ name: string; manager: string; staging_url: string; code: string }>();
    expect(project?.name).toBe("Northstar Commerce Portal");
    expect(project?.staging_url).toBe("https://staging.northstar.test/");
    // The code is the prefix on every ticket key and stays immutable.
    expect(project?.code).toBe("NSC");
  });
});

describe("notification plumbing", () => {
  it("queues client notifications without swallowing a database error", async () => {
    // Every notification path is wrapped in try/catch and logs on failure, so a
    // broken query is invisible in production. clientSideEmails shipped without
    // its clientId bind and threw on every call, which meant no client ever
    // received feedback, retest, reply or approval mail. Watch the log instead
    // of the mailbox: any *_notification_failed line is a silent outage.
    const failures: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      const line = String(args[0] ?? "");
      if (line.includes("notification_failed")) failures.push(line);
      original(...(args as []));
    };

    try {
      const tenant = await seedTenant("Northstar", "NSC");
      await setReleaseStatus({ releaseId: tenant.releaseId, status: "Retest" }, tenant.admin);
      await updateChecklist(
        { itemId: (await checklistIdsFor(tenant.releaseId))[0], state: "Passed" },
        tenant.clientTester,
      );
      await updateTicket(
        { ticketId: tenant.ticketId, field: "status", value: "Ready for retest" },
        tenant.admin,
      );
      // Announcements queue mail through the same swallowing try/catch, so they
      // belong under the same guard.
      await createAnnouncement(
        { projectId: tenant.projectId, title: "Staging is back up", body: "Sorry about the outage this morning." },
        tenant.admin,
      );
    } finally {
      console.error = original;
    }

    expect(failures).toEqual([]);
  });
});
