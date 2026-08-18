/**
 * One-time generator for the secrets self-hosted `server.ts` needs in place
 * of Alchemy's `KeyPair`/`makeRandom` resources (which persist state in the
 * Alchemy deploy state, not available outside a Cloudflare/Alchemy deploy).
 *
 * Run once, paste the output into Dokploy's environment/secrets for the
 * relay app, then discard — do not commit these values.
 *
 *   node -- scripts/generate-selfhost-secrets.ts
 */
import * as crypto from "node:crypto";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const apnsDeliveryJobSigningSecret = crypto.randomBytes(32).toString("base64");

process.stdout.write(
  [
    "# Generated once — store as Dokploy secrets, do not commit.",
    "",
    `CLOUD_MINT_PRIVATE_KEY_PEM=${JSON.stringify(privateKey)}`,
    `CLOUD_MINT_PUBLIC_KEY_PEM=${JSON.stringify(publicKey)}`,
    `APNS_DELIVERY_JOB_SIGNING_SECRET=${apnsDeliveryJobSigningSecret}`,
    "",
  ].join("\n"),
);
