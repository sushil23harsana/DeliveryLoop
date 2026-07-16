import { env } from "cloudflare:workers";

export type AppBindings = {
  APP_ENV?: string;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  DB: D1Database;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  RESEND_API_KEY?: string;
  UPLOADS?: R2Bucket;
};

export function bindings() {
  return env as unknown as AppBindings;
}

export function isProduction() {
  return bindings().APP_ENV === "production";
}
