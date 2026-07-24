import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createTicket, editTicket } from "../db/workspace";
import { seedTenant } from "./helpers/fixtures";

/**
 * "What did you expect?" used to be mandatory on all four feedback types.
 *
 * On a Question the expectation IS the question, and on a Content report the
 * correct wording is frequently the thing being asked for — so two of the four
 * types demanded a second paragraph of prose that meant nothing. That is the
 * friction that sends a tester back to a spreadsheet, and it is enforced on the
 * server, so the form relaxing its `required` attribute is not enough on its own.
 */
async function report(tenant: Awaited<ReturnType<typeof seedTenant>>, fields: Record<string, string>) {
  return createTicket(
    {
      projectId: tenant.projectId,
      releaseId: tenant.releaseId,
      severity: "Medium",
      title: "Checkout page",
      actual: "The pay button does nothing.",
      ...fields,
    },
    tenant.clientTester,
  );
}

async function ticketRow(ticketId: string) {
  return env.DB.prepare("SELECT type, expected, browser, user_agent, viewport FROM tickets WHERE id = ?")
    .bind(ticketId)
    .first<{ type: string; expected: string; browser: string; user_agent: string; viewport: string }>();
}

describe("expected result is only required where it means something", () => {
  it("accepts a Question and a Content report with no expected result", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    const question = await report(tenant, { type: "Question", actual: "Can patients cancel within two hours?" });
    const content = await report(tenant, { type: "Content", actual: "The footer shows the internal clinic code." });

    expect((await ticketRow(question.ticketId))?.expected).toBe("");
    expect((await ticketRow(content.ticketId))?.expected).toBe("");
  });

  it("still stores an expected result on a Content report when one is offered", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    const content = await report(tenant, {
      type: "Content",
      actual: "The footer shows AT-C4.",
      expected: "Show the public clinic name.",
    });

    expect((await ticketRow(content.ticketId))?.expected).toBe("Show the public clinic name.");
  });

  it("still requires an expected result on a Bug and a Change request", async () => {
    const tenant = await seedTenant("Northstar", "NSC");

    await expect(report(tenant, { type: "Bug" })).rejects.toThrow("Expected result is required");
    await expect(report(tenant, { type: "Change request", actual: "Add a GST field." }))
      .rejects.toThrow("Expected result is required");
  });

  it("applies the same rule on edit, in both directions", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    // seedTenant files a Bug carrying both fields.
    const edit = (fields: Record<string, string>) => editTicket(
      {
        ticketId: tenant.ticketId,
        severity: "Medium",
        title: "Checkout page",
        actual: "The pay button does nothing.",
        ...fields,
      },
      tenant.clientTester,
    );

    // Retyping a Bug as a Question drops the requirement — and clears the value,
    // because the form that no longer shows the field sends "".
    await edit({ type: "Question", expected: "" });
    expect(await ticketRow(tenant.ticketId)).toMatchObject({ type: "Question", expected: "" });

    // Turning it back into a Bug reinstates it.
    await expect(edit({ type: "Bug" })).rejects.toThrow("Expected result is required");

    await edit({ type: "Bug", expected: "It should charge the card." });
    expect(await ticketRow(tenant.ticketId)).toMatchObject({ type: "Bug", expected: "It should charge the card." });
  });
});

describe("browser and viewport honesty", () => {
  it("round-trips the raw user agent alongside the friendly browser string", async () => {
    const tenant = await seedTenant("Northstar", "NSC");
    const rawUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

    const ticket = await report(tenant, {
      type: "Bug",
      expected: "It should charge the card.",
      browser: "Chrome 138 · Windows",
      userAgent: rawUserAgent,
      viewport: "1440 x 900",
    });

    expect(await ticketRow(ticket.ticketId)).toMatchObject({
      browser: "Chrome 138 · Windows",
      user_agent: rawUserAgent,
      viewport: "1440 x 900",
    });
  });

  it("stores an empty viewport rather than inventing one", async () => {
    // Without the capture bookmarklet nothing has measured the page under test.
    // DeliveryLoop's own window size is a confident answer to a question nobody
    // asked, so the form submits nothing and the drawer says "Not captured".
    const tenant = await seedTenant("Northstar", "NSC");

    const ticket = await report(tenant, { type: "Bug", expected: "It should charge the card." });

    expect((await ticketRow(ticket.ticketId))?.viewport).toBe("");
  });
});
