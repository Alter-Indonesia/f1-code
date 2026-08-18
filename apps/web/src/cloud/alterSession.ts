// @effect-diagnostics cryptoRandomUUID:off - browser OAuth state needs platform randomness.
const ALTER_SESSION_STORAGE_KEY = "t3code:alter-oidc-session:v1";
const ALTER_STATE_STORAGE_KEY = "t3code:alter-oidc-state:v1";

export function buildAlterLoginUrl(): string | null {
  const issuer = (import.meta.env.VITE_ALTER_OIDC_ISSUER as string | undefined)?.trim();
  const clientId = (import.meta.env.VITE_ALTER_OIDC_CLIENT_ID as string | undefined)?.trim();
  const configuredRedirectUri = (
    import.meta.env.VITE_ALTER_OIDC_REDIRECT_URI as string | undefined
  )?.trim();
  const redirectUri =
    window.location.protocol === "f1code-dev:"
      ? "f1code-dev://app/oauth/callback"
      : window.location.protocol === "f1code:"
        ? "f1code://app/oauth/callback"
        : configuredRedirectUri;
  if (!issuer || !clientId || !redirectUri) return null;
  const state = crypto.randomUUID();
  window.sessionStorage.setItem(ALTER_STATE_STORAGE_KEY, state);
  const url = new URL(`${issuer.replace(/\/+$/u, "")}/oidc/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
  }).toString();
  return url.toString();
}

interface StoredAlterSession {
  readonly accessToken: string;
  readonly expiresAt?: number;
  readonly subject: string;
}

function decodeSubject(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/gu, "+").replace(/_/gu, "/"))) as {
      sub?: unknown;
      exp?: unknown;
    };
    return typeof decoded.sub === "string" && decoded.sub.length > 0 ? decoded.sub : null;
  } catch {
    return null;
  }
}

export function readAlterSession(): StoredAlterSession | null {
  try {
    const raw = window.localStorage.getItem(ALTER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredAlterSession>;
    if (typeof value.accessToken !== "string" || typeof value.subject !== "string") return null;
    if (value.expiresAt !== undefined && value.expiresAt <= Date.now()) {
      clearAlterSession();
      return null;
    }
    return value as StoredAlterSession;
  } catch {
    return null;
  }
}

export function storeAlterSession(input: { accessToken: string; expiresAt?: number }): boolean {
  const subject = decodeSubject(input.accessToken);
  if (!subject) return false;
  try {
    window.localStorage.setItem(ALTER_SESSION_STORAGE_KEY, JSON.stringify({ ...input, subject }));
    return true;
  } catch {
    return false;
  }
}

export function clearAlterSession(): void {
  try {
    window.localStorage.removeItem(ALTER_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
