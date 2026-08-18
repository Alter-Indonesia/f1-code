import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface OidcProviderConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly jwksUri?: string;
}

export interface OidcUserClaims extends JWTPayload {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
}

/**
 * Verifies an OIDC bearer/ID token using the provider's JWKS.
 *
 * Alter's client configuration does not expose a separate audience value, so
 * the registered client ID is the expected `aud` claim. The issuer is checked
 * as well; a valid signature from another OIDC tenant is not sufficient.
 */
export async function verifyOidcToken(
  token: string,
  config: OidcProviderConfig,
): Promise<OidcUserClaims> {
  const issuer = normalizeIssuer(config.issuer);
  const jwks = createRemoteJWKSet(new URL(config.jwksUri ?? `${issuer}/.well-known/jwks.json`));
  const result = await jwtVerify(token, jwks, {
    issuer,
    audience: config.clientId,
  });

  if (typeof result.payload.sub !== "string" || result.payload.sub.length === 0) {
    throw new Error("OIDC token is missing a subject.");
  }

  return result.payload as OidcUserClaims;
}

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}
