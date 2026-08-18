import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/**
 * Plain env-based replacement for `zone.ts`'s `RelayDeploymentConfig`. No
 * Cloudflare zone/tunnel provisioning here — the public hostname is just
 * whatever domain the reverse proxy (Cloudflare Tunnel + Nginx Proxy
 * Manager) terminates in front of this process.
 */
export const SelfHostDeploymentConfig = Effect.gen(function* () {
  const stage = yield* Config.string("RELAY_STAGE").pipe(Config.withDefault("prod"));
  const relayPublicDomain = yield* Config.nonEmptyString("RELAY_DOMAIN");

  return {
    stage,
    relayPublicDomain,
    relayPublicOrigin: `https://${relayPublicDomain}`,
  };
});
