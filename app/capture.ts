/**
 * Browser-side capture helpers. Imports nothing server-side on purpose — this
 * module is pulled into the client bundle by the report form.
 *
 * The raw user-agent string is a 140-character token soup that says "Mozilla/5.0"
 * on every browser shipped this decade. Storing it is right; showing it to a
 * client tester is not. `parseBrowser()` produces the one line a human needs —
 * "Chrome 138 · Windows" — and the raw header travels alongside it in
 * `tickets.user_agent` for whoever has to reproduce the problem.
 */

type UserAgentBrand = { brand: string; version: string };
type UserAgentData = { brands?: UserAgentBrand[]; platform?: string };

const BRAND_SEPARATOR = " · ";

// Chromium reports several brands, two of which are noise: a deliberate
// "Not)A;Brand" cache-buster and the generic "Chromium" every fork shares.
const IGNORED_BRANDS = /not[\s)(;:.\-/_]*a[\s)(;:.\-/_]*brand|^chromium$/i;

// Marketing names to the short label people actually use.
const BRAND_NAMES: Record<string, string> = {
  "Google Chrome": "Chrome",
  "Microsoft Edge": "Edge",
  "Opera GX": "Opera",
};

// Order matters: Edge, Opera and Samsung Internet all carry "Chrome/NNN" in
// their user agent, and Chrome carries "Safari/537.36". First match wins, so the
// specific tokens have to be tried before the generic ones.
const UA_BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, "Edge"],
  [/\bOPR\/(\d+)/, "Opera"],
  [/\bOpera\/(\d+)/, "Opera"],
  [/\bSamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/\bFxiOS\/(\d+)/, "Firefox"],
  [/\bFirefox\/(\d+)/, "Firefox"],
  [/\bCriOS\/(\d+)/, "Chrome"],
  [/\bChrome\/(\d+)/, "Chrome"],
  [/\bVersion\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari/, "Safari"],
];

const UA_PLATFORMS: [RegExp, string][] = [
  [/\bWindows NT\b/, "Windows"],
  [/\bAndroid\b/, "Android"],
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function join(name: string, version: string, platform: string) {
  const left = [name, version].filter(Boolean).join(" ");
  return [left, platform].filter(Boolean).join(BRAND_SEPARATOR);
}

/** The raw header, or "" when there is no browser (SSR, tests). */
export function rawUserAgent() {
  if (typeof navigator === "undefined") return "";
  return (navigator.userAgent || "").slice(0, 500);
}

/**
 * Reads the structured hints Chromium exposes, falling back to a compact regex
 * over the user-agent string. Returns "" rather than a guess when neither says
 * anything useful — an empty field reads as "unknown", a wrong one does not.
 */
export function parseBrowser(userAgentData?: UserAgentData | null, userAgent?: string): string {
  const data = userAgentData !== undefined
    ? userAgentData
    : (typeof navigator === "undefined" ? null : (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData || null);
  const ua = userAgent !== undefined ? userAgent : rawUserAgent();

  const brand = (data?.brands || []).find((entry) => entry.brand && !IGNORED_BRANDS.test(entry.brand.trim()));
  if (brand) {
    const name = BRAND_NAMES[brand.brand.trim()] || brand.brand.trim();
    // `platform` is a coarse label ("Windows", "macOS", "Android") by design —
    // the precise version sits behind a permission prompt nobody should trigger
    // to file a bug.
    return join(name.slice(0, 40), String(brand.version || "").split(".")[0], (data?.platform || platformFromUserAgent(ua)).slice(0, 24));
  }

  if (!ua) return "";
  for (const [pattern, name] of UA_BROWSERS) {
    const match = pattern.exec(ua);
    if (match) return join(name, match[1], platformFromUserAgent(ua));
  }
  return platformFromUserAgent(ua);
}

function platformFromUserAgent(ua: string) {
  for (const [pattern, name] of UA_PLATFORMS) {
    if (pattern.test(ua)) return name;
  }
  return "";
}
