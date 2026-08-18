import {
  connectLoopbackRedirectUri,
  CONNECT_OAUTH_SCOPES,
  DEFAULT_HOSTED_APP_URL,
} from "@t3tools/shared/connectAuth";
import { normalizeSecureRelayUrl } from "@t3tools/shared/relayUrl";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

declare const __T3CODE_BUILD_RELAY_URL__: string | undefined;
declare const __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__: string | undefined;
declare const __T3CODE_BUILD_CLERK_CLI_OAUTH_CLIENT_ID__: string | undefined;
declare const __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_URL__: string | undefined;
declare const __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_DATASET__: string | undefined;
declare const __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_TOKEN__: string | undefined;

const CLOUD_CLI_OAUTH_LOOPBACK_PORT = 34338;
const CLOUD_CLI_OAUTH_SCOPES = CONNECT_OAUTH_SCOPES;

function validateRelayUrl(value: string) {
  const relayUrl = normalizeSecureRelayUrl(value);
  return relayUrl === null
    ? Effect.fail(
        new Config.ConfigError(
          new Schema.SchemaError(
            new SchemaIssue.InvalidValue({
              message: "Relay URL must be a secure absolute HTTPS origin.",
            }),
          ),
        ),
      )
    : Effect.succeed(relayUrl);
}

function readBuildTimeValue(value: string | undefined): string {
  return typeof value === "undefined" ? "" : value.trim();
}

function normalizeSecureUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const buildTimeRelayUrl =
  typeof __T3CODE_BUILD_RELAY_URL__ === "undefined"
    ? ""
    : (normalizeSecureRelayUrl(__T3CODE_BUILD_RELAY_URL__) ?? "");
export const buildTimeClerkPublishableKey = readBuildTimeValue(
  typeof __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__ === "undefined"
    ? undefined
    : __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__,
);
export const buildTimeClerkCliOAuthClientId = readBuildTimeValue(
  typeof __T3CODE_BUILD_CLERK_CLI_OAUTH_CLIENT_ID__ === "undefined"
    ? undefined
    : __T3CODE_BUILD_CLERK_CLI_OAUTH_CLIENT_ID__,
);
export const buildTimeRelayClientTracing = {
  tracesUrl: readBuildTimeValue(
    typeof __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_URL__ === "undefined"
      ? undefined
      : __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_URL__,
  ),
  tracesDataset: readBuildTimeValue(
    typeof __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_DATASET__ === "undefined"
      ? undefined
      : __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_DATASET__,
  ),
  tracesToken: readBuildTimeValue(
    typeof __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_TOKEN__ === "undefined"
      ? undefined
      : __T3CODE_BUILD_RELAY_CLIENT_OTLP_TRACES_TOKEN__,
  ),
} as const;

export function resolveRelayClientTracingConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fallback = buildTimeRelayClientTracing,
) {
  const tracesUrl = env.T3CODE_RELAY_CLIENT_OTLP_TRACES_URL?.trim() || fallback.tracesUrl;
  const tracesDataset =
    env.T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET?.trim() || fallback.tracesDataset;
  const tracesToken = env.T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN?.trim() || fallback.tracesToken;
  const normalizedTracesUrl = normalizeSecureUrl(tracesUrl);
  return normalizedTracesUrl && tracesDataset && tracesToken
    ? { tracesUrl: normalizedTracesUrl, tracesDataset, tracesToken }
    : null;
}

export function makeRelayUrlConfig(fallback = buildTimeRelayUrl) {
  const runtimeConfig = Config.nonEmptyString("T3CODE_RELAY_URL");
  return (fallback ? runtimeConfig.pipe(Config.withDefault(fallback)) : runtimeConfig).pipe(
    Config.mapOrFail(validateRelayUrl),
  );
}

export const relayUrlConfig = makeRelayUrlConfig();

/**
 * Hosted app origin used for out-of-band OAuth on headless
 * machines. Overridable so staging/nightly builds can point their CLIs at a
 * matching hosted deployment.
 */
export const hostedAppUrlConfig = makePublicValueConfig(
  "T3CODE_HOSTED_APP_URL",
  DEFAULT_HOSTED_APP_URL,
).pipe(Config.mapOrFail(validateHostedAppUrl));

function validateHostedAppUrl(value: string) {
  try {
    const url = new URL(value);
    const isLoopbackHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
    if (
      (url.protocol !== "https:" && !isLoopbackHttp) ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error("invalid hosted app origin");
    }
    return Effect.succeed(url.origin);
  } catch {
    return Effect.fail(
      new Config.ConfigError(
        new Schema.SchemaError(
          new SchemaIssue.InvalidValue({
            message: "Hosted app URL must be an absolute HTTPS origin (or HTTP loopback origin).",
          }),
        ),
      ),
    );
  }
}

function makePublicValueConfig(name: string, fallback: string) {
  const runtimeConfig = Config.nonEmptyString(name);
  return (fallback ? runtimeConfig.pipe(Config.withDefault(fallback)) : runtimeConfig).pipe(
    Config.map((value) => value.trim()),
  );
}

/**
 * The CLI never calls the OIDC authorize endpoint itself: the browser leg goes
 * through the hosted /connect page, which builds the authorize URL after a
 * Clerk session exists (see CliTokenManager.login). Only the token endpoint
 * is contacted directly.
 */
export interface CloudCliOAuthConfig {
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly clientSecret?: Redacted.Redacted<string>;
  readonly loopbackPort: number;
  readonly redirectUri: string;
  readonly scopes: typeof CLOUD_CLI_OAUTH_SCOPES;
}

export function makeCloudCliOAuthConfig({
  oidcIssuerFallback = process.env.ALTER_OIDC_ISSUER ?? "https://one.alterindonesia.com",
  oidcClientIdFallback = process.env.ALTER_OIDC_CLIENT_ID ?? "",
}: {
  readonly oidcIssuerFallback?: string;
  readonly oidcClientIdFallback?: string;
  /** @deprecated retained for callers while migrating from Clerk. */
  readonly clerkPublishableKeyFallback?: string;
  /** @deprecated retained for callers while migrating from Clerk. */
  readonly clerkCliOAuthClientIdFallback?: string;
} = {}) {
  return Config.all({
    clientId: makePublicValueConfig("ALTER_OIDC_CLIENT_ID", oidcClientIdFallback),
    issuer: makePublicValueConfig("ALTER_OIDC_ISSUER", oidcIssuerFallback),
    clientSecret: Config.redacted("ALTER_OIDC_CLIENT_SECRET"),
  }).pipe(
    Config.map(
      ({ issuer, clientId, clientSecret }) =>
        ({
          tokenEndpoint: `${issuer.replace(/\/+$/u, "")}/oidc/token`,
          clientId,
          clientSecret,
          loopbackPort: CLOUD_CLI_OAUTH_LOOPBACK_PORT,
          redirectUri: connectLoopbackRedirectUri(CLOUD_CLI_OAUTH_LOOPBACK_PORT),
          scopes: CLOUD_CLI_OAUTH_SCOPES,
        }) as CloudCliOAuthConfig,
    ),
  );
}

export const cloudCliOAuthConfig = makeCloudCliOAuthConfig();

export const hasCloudPublicConfig = Boolean(
  (normalizeSecureRelayUrl(process.env.T3CODE_RELAY_URL ?? "") ?? buildTimeRelayUrl) &&
  (process.env.T3CODE_CLERK_PUBLISHABLE_KEY?.trim() || buildTimeClerkPublishableKey) &&
  (process.env.T3CODE_CLERK_CLI_OAUTH_CLIENT_ID?.trim() || buildTimeClerkCliOAuthClientId),
);
