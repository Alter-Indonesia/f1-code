import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

/**
 * Exchanges an Alter OIDC authorization code for an access token on behalf
 * of `apps/web`. Has to live server-side: `one.alterindonesia.com`'s
 * `/oidc/token` endpoint requires `client_secret` for every client (no
 * public/PKCE-only auth method — confirmed against alter_one's own
 * `OidcController.php`/`OidcTokenService.php`), so the browser can never
 * hold this secret itself. The browser only ever sees the resulting access
 * token, never the client secret.
 */

interface AlterTokenResponse {
  readonly access_token?: unknown;
  readonly expires_in?: unknown;
}

const errorResponse = (message: string, status: number) =>
  HttpServerResponse.json({ error: message }, { status });

export const oidcTokenExchangeRoute = HttpRouter.add(
  "POST",
  "/oidc/token-exchange",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* request.json) as { code?: unknown; redirectUri?: unknown };
    const code = typeof body.code === "string" ? body.code : null;
    const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri : null;
    if (!code || !redirectUri) {
      return yield* errorResponse("code and redirectUri are required", 400);
    }

    const issuer = yield* Config.nonEmptyString("ALTER_OIDC_ISSUER");
    const clientId = yield* Config.nonEmptyString("ALTER_OIDC_CLIENT_ID");
    const clientSecret = yield* Config.redacted("ALTER_OIDC_CLIENT_SECRET");
    const httpClient = yield* HttpClient.HttpClient;

    const tokenRequest = HttpClientRequest.post(`${issuer.replace(/\/+$/u, "")}/oidc/token`).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyUrlParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: Redacted.value(clientSecret),
      }),
    );

    const response = yield* httpClient.execute(tokenRequest);
    if (response.status >= 400) {
      const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
      return yield* errorResponse(`Alter One SSO rejected the exchange: ${text}`, 502);
    }

    const token = (yield* response.json) as unknown as AlterTokenResponse;
    if (typeof token.access_token !== "string") {
      return yield* errorResponse("Alter One SSO response did not include an access token", 502);
    }

    return yield* HttpServerResponse.json({
      accessToken: token.access_token,
      expiresIn: typeof token.expires_in === "number" ? token.expires_in : null,
    });
  }).pipe(
    // catchCause, not just catch: this route is added via raw HttpRouter.add
    // (not HttpApiBuilder's schema-based handling), which doesn't have
    // automatic defect-to-500 conversion — an unexpected throw here (e.g.
    // from the outbound fetch) would otherwise kill the connection outright
    // instead of returning a response, showing up as a bare Cloudflare 502
    // with no body.
    Effect.catchCause((cause) => errorResponse(`Token exchange failed: ${cause.toString()}`, 500)),
  ),
);
