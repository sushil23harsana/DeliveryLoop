import { env } from "cloudflare:test";
import {
  type Actor,
  createClient,
  createProject,
  createRelease,
  createTicket,
} from "../../db/workspace";

// Domain functions take `actor` explicitly and never read a session, so an actor
// is just a literal. Only tests that exercise getWorkspace's member list or
// notification routing need a real `members` row.
export function staffActor(role = "agency_admin", overrides: Partial<Actor> = {}): Actor {
  return {
    id: `member-staff-${role}`,
    email: `${role}@altrdtech.com`,
    name: `Staff ${role}`,
    role,
    clientId: null,
    isStaff: true,
    ...overrides,
  };
}

export function clientActor(
  role: string,
  clientId: string,
  overrides: Partial<Actor> = {},
): Actor {
  return {
    id: `member-client-${role}-${clientId}`,
    email: `${role}@client.test`,
    name: `Client ${role}`,
    role,
    clientId,
    isStaff: false,
    ...overrides,
  };
}

export type SeededTenant = {
  clientId: string;
  projectId: string;
  releaseId: string;
  ticketId: string;
  ticketKey: string;
  admin: Actor;
  clientAdmin: Actor;
  clientTester: Actor;
  clientViewer: Actor;
};

/**
 * Builds one complete tenant through the real domain functions rather than raw
 * SQL, so fixtures cannot drift from the schema or skip validation.
 * `code` must be unique per tenant — projects.code has a UNIQUE index.
 */
export async function seedTenant(label: string, code: string): Promise<SeededTenant> {
  const admin = staffActor("agency_admin");
  await insertMember(admin);

  const clientId = await createClient(
    {
      name: `${label} Ltd`,
      contactName: `${label} Contact`,
      contactEmail: `contact@${label.toLowerCase()}.test`,
    },
    admin,
  );

  const projectId = await createProject(
    {
      clientId,
      name: `${label} Portal`,
      code,
      manager: "Staff agency_admin",
      description: `${label} delivery`,
      stage: "UAT",
      stagingUrl: "",
    },
    admin,
  );

  // `checklist` is assigned after construction because the parameter type is
  // Record<string, string> & { checklist?: string[] }, and an object literal
  // carrying a string[] cannot satisfy the string index signature directly.
  const releaseInput: Record<string, string> & { checklist?: string[] } = {
    projectId,
    name: `${label} release one`,
    version: "v1.0",
    build: "build-1",
    startDate: "2026-07-01",
    dueDate: "2026-07-31",
    testingNotes: "Test the checkout flow.",
    // Open it immediately: a Preparing release is a draft the client cannot see
    // or report against, which is not the state most tests want to start from.
    openNow: "1",
  };
  releaseInput.checklist = ["Guest checkout works", "Invoice email arrives"];
  const releaseId = await createRelease(releaseInput, admin);

  const clientAdmin = clientActor("client_admin", clientId, {
    name: `${label} Admin`,
    email: `admin@${label.toLowerCase()}.test`,
  });
  const clientTester = clientActor("client_tester", clientId, {
    name: `${label} Tester`,
    email: `tester@${label.toLowerCase()}.test`,
  });
  const clientViewer = clientActor("client_viewer", clientId, {
    name: `${label} Viewer`,
    email: `viewer@${label.toLowerCase()}.test`,
  });
  await insertMember(clientAdmin);
  await insertMember(clientTester);
  await insertMember(clientViewer);

  const ticket = await createTicket(
    {
      projectId,
      releaseId,
      type: "Bug",
      severity: "Medium",
      title: `${label} checkout fails`,
      actual: "The pay button does nothing.",
      expected: "It should charge the card.",
    },
    clientTester,
  );

  return {
    clientId,
    projectId,
    releaseId,
    ticketId: ticket.ticketId,
    ticketKey: ticket.key,
    admin,
    clientAdmin,
    clientTester,
    clientViewer,
  };
}

/** Puts a real R2 object so validateAttachmentKey() accepts the key. */
export async function putUpload(key: string, uploaderId: string) {
  await env.UPLOADS.put(key, "fake-image-bytes", {
    customMetadata: { uploadedBy: uploaderId },
  });
  return key;
}

/**
 * Inserts the members row an actor needs to act at all: rate_limit_events.actor_id
 * carries a foreign key to members.id, so every rate-limited write (which is all
 * of them) fails without one. In production resolveActor guarantees this.
 * OR IGNORE so shared staff actors can be seeded once per tenant.
 */
export async function insertMember(actor: Actor, active = "1") {
  // Mirrors the default createMember applies, so notification-routing tests see
  // the same modes production does: a viewer is on the digest, everyone else is
  // on standard per-item mail.
  const notifyMode = actor.role === "client_viewer" ? "digest" : "standard";
  await env.DB.prepare(
    "INSERT OR IGNORE INTO members (id,client_id,name,email,role,active,notify_mode) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(actor.id, actor.clientId, actor.name, actor.email, actor.role, active, notifyMode)
    .run();
}
