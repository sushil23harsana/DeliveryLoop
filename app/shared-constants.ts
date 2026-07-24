/**
 * Values that both the server domain layer and the browser UI must agree on.
 *
 * This file must stay free of imports — db/workspace.ts pulls in
 * `cloudflare:workers` and DeliveryLoopApp.tsx is a client component, so the
 * only safe way for them to share a constant is a module that depends on nothing.
 *
 * Kept deliberately small for now; the rest of the duplicated status, role and
 * severity lists move here when the single-source-of-truth pass lands.
 */

/**
 * A ticket in one of these states no longer blocks a release approval.
 *
 * The server's blocker query and the UI's approval gate previously disagreed
 * about `Withdrawn`: the UI treated it as closed and enabled the approve button,
 * while the server still counted a withdrawn Critical ticket as blocking and
 * returned a 409 naming nothing. Both now read this list.
 */
export const CLOSED_TICKET_STATUSES = [
  "Verified",
  "Closed",
  "Deferred",
  "Rejected / out of scope",
  "Withdrawn",
] as const;
