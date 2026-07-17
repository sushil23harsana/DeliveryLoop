import { waitUntil } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { bindings, isProduction } from "./runtime-env";

function authSecret() {
  const secret = bindings().BETTER_AUTH_SECRET;
  if (secret) return secret;
  return "deliveryloop-build-placeholder-secret-runtime-requests-are-blocked";
}

function authBaseURL() {
  const baseURL = bindings().BETTER_AUTH_URL;
  if (baseURL) return baseURL.replace(/\/$/, "");
  if (!isProduction()) return "http://localhost:3000";
  throw new Error("BETTER_AUTH_URL is required in production");
}

export function assertAuthConfigured() {
  if (isProduction() && !bindings().BETTER_AUTH_SECRET) {
    throw new Error("Authentication is not configured");
  }
}

async function invitedMember(emailValue: unknown) {
  if (typeof emailValue !== "string") return null;
  const email = emailValue.trim().toLowerCase();
  if (!email) return null;
  return bindings().DB.prepare("SELECT id,email,name,role,client_id,active FROM members WHERE lower(email) = ?")
    .bind(email)
    .first<{ id: string; email: string; name: string; role: string; client_id: string | null; active: string }>();
}

// The owner's members row is normally created in resolveActor, but the JWT
// plugin's definePayload runs during getSession — before resolveActor ever
// executes — so the bootstrap admin must also be able to materialise here.
async function invitedOrBootstrapMember(email: string, name: string) {
  const member = await invitedMember(email);
  if (member) return member;
  const owner = (bindings().BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!owner || owner !== email.trim().toLowerCase()) return null;
  await bindings().DB.prepare(
    "INSERT OR IGNORE INTO members (id,email,name,role,client_id,invited_by,invited_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
  ).bind(`member-${crypto.randomUUID()}`, owner, name || "Workspace owner", "agency_admin", null, "Owner bootstrap").run();
  return invitedMember(email);
}

export const auth = betterAuth({
  appName: "DeliveryLoop",
  baseURL: authBaseURL(),
  secret: authSecret(),
  database: bindings().DB,
  databaseOptions: { transaction: false },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: sendPasswordResetEmail,
  },
  emailVerification: {
    expiresIn: 60 * 60,
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail,
  },
  verification: { storeIdentifier: "hashed" },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60 * 10, max: 5 },
      "/request-password-reset": { window: 60 * 10, max: 5 },
      "/send-verification-email": { window: 60 * 10, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: isProduction(),
    cookiePrefix: "deliveryloop",
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    backgroundTasks: { handler: waitUntil },
  },
  trustedOrigins: [authBaseURL()],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
      const member = await invitedMember(email);
      const owner = (bindings().BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
      const ownerAllowed = Boolean(owner && owner === email);
      if ((!member && !ownerAllowed) || member?.active === "0") {
        throw new APIError("UNAUTHORIZED", { message: "This email does not have active DeliveryLoop access" });
      }
      if (ctx.path === "/sign-up/email" && member) ctx.body.name = member.name;
    }),
  },
  plugins: [jwt({
    jwks: {
      rotationInterval: 60 * 60 * 24 * 30,
      gracePeriod: 60 * 60 * 24 * 30,
      jwksPath: "/jwks",
    },
    jwt: {
      issuer: authBaseURL(),
      audience: "deliveryloop-api",
      expirationTime: "15m",
      definePayload: async ({ user }) => {
        const member = await invitedOrBootstrapMember(user.email, user.name);
        if (!member || member.active !== "1") throw new APIError("UNAUTHORIZED", { message: "Active workspace access is required" });
        return { email: user.email, role: member.role, clientId: member.client_id };
      },
    },
  })],
  telemetry: { enabled: false },
  onAPIError: {
    onError(error) {
      const message = error instanceof Error ? error.message : "Authentication request failed";
      console.error(JSON.stringify({ event: "auth_error", message }));
    },
  },
});
