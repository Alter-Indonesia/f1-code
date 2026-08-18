import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/**
 * Replaces Alchemy's `KeyPair("CloudMintKeyPair")` (which mints and persists
 * an ed25519 keypair in Alchemy state). Self-host generates the same shape
 * once with `scripts/generate-selfhost-secrets.ts` and stores it as a
 * Dokploy secret — PEM pkcs8 private key, PEM spki public key.
 */
export const CloudMintKeys = Effect.gen(function* () {
  const privateKey = yield* Config.redacted("CLOUD_MINT_PRIVATE_KEY_PEM");
  const publicKey = yield* Config.nonEmptyString("CLOUD_MINT_PUBLIC_KEY_PEM");
  return { privateKey, publicKey };
});

export const ApnsDeliveryJobSigningSecret = Config.redacted("APNS_DELIVERY_JOB_SIGNING_SECRET");
