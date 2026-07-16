import { waitUntil } from "cloudflare:workers";
import { bindings } from "./runtime-env";

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appEmailHtml(eyebrow: string, heading: string, copy: string, button: string, url: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#202329"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:40px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fff;border:1px solid #e1e4e8;border-radius:12px"><tr><td style="padding:32px"><p style="margin:0 0 26px;color:#3157d5;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(eyebrow)}</p><h1 style="margin:0 0 14px;font-size:25px;line-height:1.25">${escapeHtml(heading)}</h1><p style="margin:0 0 24px;color:#626975;font-size:15px;line-height:1.65">${escapeHtml(copy)}</p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#202329;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(button)}</a><p style="margin:28px 0 0;color:#9298a2;font-size:12px;line-height:1.55">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p></td></tr></table></td></tr></table></body></html>`;
}

async function idempotencyKey(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `deliveryloop/${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function sendEmail(message: EmailMessage) {
  const runtime = bindings();
  if (!runtime.RESEND_API_KEY || !runtime.EMAIL_FROM) {
    throw new Error("Transactional email is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
      "User-Agent": "DeliveryLoop/1.0 (+https://github.com/sushil23harsana/DeliveryLoop)",
    },
    body: JSON.stringify({
      from: runtime.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(runtime.EMAIL_REPLY_TO ? { reply_to: runtime.EMAIL_REPLY_TO } : {}),
    }),
  });

  if (!response.ok) {
    console.error(JSON.stringify({ event: "email_send_failed", provider: "resend", status: response.status }));
    throw new Error("Email delivery failed");
  }
  console.info(JSON.stringify({ event: "email_queued", provider: "resend", status: response.status }));
}

export async function sendVerificationEmail(data: { user: { email: string; name: string }; url: string; token: string }) {
  await sendEmail({
    to: data.user.email,
    subject: "Verify your DeliveryLoop email",
    html: appEmailHtml("DeliveryLoop security", "Verify your email", `Hi ${data.user.name}, confirm this address to finish activating your secure DeliveryLoop account. This link expires in one hour.`, "Verify email", data.url),
    text: `Hi ${data.user.name},\n\nConfirm your email to activate DeliveryLoop. This link expires in one hour:\n${data.url}\n`,
    idempotencyKey: await idempotencyKey(`verify:${data.user.email}:${data.token}`),
  });
}

export async function sendPasswordResetEmail(data: { user: { email: string; name: string }; url: string; token: string }) {
  await sendEmail({
    to: data.user.email,
    subject: "Reset your DeliveryLoop password",
    html: appEmailHtml("DeliveryLoop security", "Reset your password", `Hi ${data.user.name}, use this secure link to choose a new password. It expires in one hour. If you did not request this, you can ignore this email.`, "Reset password", data.url),
    text: `Hi ${data.user.name},\n\nReset your DeliveryLoop password. This link expires in one hour:\n${data.url}\n\nIf you did not request this, ignore this email.`,
    idempotencyKey: await idempotencyKey(`reset:${data.user.email}:${data.token}`),
  });
}

export async function queueInvitationEmail(member: { id: string; email: string; name: string }, invitedBy: string, eventId = member.id) {
  const runtime = bindings();
  if (!runtime.RESEND_API_KEY || !runtime.EMAIL_FROM || !runtime.BETTER_AUTH_URL) return false;
  const url = new URL("/", runtime.BETTER_AUTH_URL);
  url.searchParams.set("auth", "activate");
  url.searchParams.set("email", member.email);
  const message: EmailMessage = {
    to: member.email,
    subject: "You have been invited to DeliveryLoop",
    html: appEmailHtml("Client delivery workspace", "Your DeliveryLoop access is ready", `${invitedBy} invited you to a secure workspace for release testing, feedback and acceptance. Activate your account using this exact email address.`, "Activate account", url.toString()),
    text: `Hi ${member.name},\n\n${invitedBy} invited you to DeliveryLoop. Activate your account using ${member.email}:\n${url}\n`,
    idempotencyKey: await idempotencyKey(`invite:${eventId}:${member.email}`),
  };
  waitUntil(sendEmail(message));
  return true;
}
