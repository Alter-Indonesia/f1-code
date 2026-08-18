/**
 * Self-hosted entrypoint for the relay. Mirrors `worker.ts` (the Cloudflare
 * Worker/Alchemy entrypoint) service-for-service, but swaps every
 * Cloudflare-bound piece for a plain Node process:
 *
 *  - Hyperdrive→PlanetScale Postgres  -> direct `DATABASE_URL` (selfhost/db.ts)
 *  - Cloudflare Queues (APNs)         -> in-process queue (selfhost/localApnsDelivery.ts)
 *  - Alchemy KeyPair / makeRandom     -> pre-generated secrets from env (selfhost/keys.ts)
 *  - Cloudflare Tunnel/DNS bindings   -> plain REST calls (selfhost/managedEndpointCloudflare.ts)
 *  - Worker `fetch` export            -> Node HTTP listener (HttpRouter.serve + NodeHttpServer)
 *  - Workers cron trigger             -> Effect.repeat on a fixed schedule
 *
 * All business logic (the `http/Api.ts` handlers, `environments/*`,
 * `agentActivity/*`, `auth/*`) is imported unchanged from upstream.
 *
 * Run with: node -- src/server.ts
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import { FetchHttpClient } from "effect/unstable/http";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";

import { RelayApi } from "@t3tools/contracts/relay";

import {
  clientApi,
  dpopClientApi,
  healthApi,
  metadataApi,
  mobileApi,
  relayClientAuthLayer,
  relayDpopClientAuthLayer,
  relayCors,
  relayDocsRedirectRoute,
  relayEnvironmentAuthLayer,
  relayNotFoundRoute,
  serverApi,
  tokenApi,
} from "./http/Api.ts";
import * as DeliveryAttempts from "./agentActivity/DeliveryAttempts.ts";
import * as AgentActivityRows from "./agentActivity/AgentActivityRows.ts";
import * as Devices from "./agentActivity/Devices.ts";
import * as DpopProofs from "./auth/DpopProofs.ts";
import * as RelayTokens from "./auth/RelayTokens.ts";
import * as EnvironmentCredentials from "./environments/EnvironmentCredentials.ts";
import * as EnvironmentLinks from "./environments/EnvironmentLinks.ts";
import * as ManagedEndpointAllocations from "./environments/ManagedEndpointAllocations.ts";
import * as LiveActivities from "./agentActivity/LiveActivities.ts";
import * as RelayDb from "./db.ts";
import * as RelayConfiguration from "./Config.ts";
import * as AgentActivityPublisher from "./agentActivity/AgentActivityPublisher.ts";
import * as ApnsClient from "./agentActivity/ApnsClient.ts";
import * as ApnsProviderTokens from "./agentActivity/ApnsProviderTokens.ts";
import * as ApnsDeliveries from "./agentActivity/ApnsDeliveries.ts";
import * as ApnsDeliveryQueue from "./agentActivity/ApnsDeliveryQueue.ts";
import * as EnvironmentConnector from "./environments/EnvironmentConnector.ts";
import * as EnvironmentLinker from "./environments/EnvironmentLinker.ts";
import * as EnvironmentPublishSignatures from "./environments/EnvironmentPublishSignatures.ts";
import * as ManagedEndpointProvider from "./environments/ManagedEndpointProvider.ts";
import * as ManagedTunnelLimits from "./environments/ManagedTunnelLimits.ts";
import * as MobileRegistrations from "./agentActivity/MobileRegistrations.ts";

import { RelayDbLive } from "./selfhost/db.ts";
import {
  queueLayer as localApnsQueueLayer,
  senderLayer as localApnsSenderLayer,
  runConsumer as runLocalApnsConsumer,
} from "./selfhost/localApnsDelivery.ts";
import { layer as managedEndpointCloudflareLayer } from "./selfhost/managedEndpointCloudflare.ts";
import { oidcTokenExchangeRoute } from "./selfhost/oidcTokenExchange.ts";
import { SelfHostDeploymentConfig } from "./selfhost/deploymentConfig.ts";
import { CloudMintKeys, ApnsDeliveryJobSigningSecret } from "./selfhost/keys.ts";

const relayApiLayer = Layer.mergeAll(
  healthApi,
  metadataApi,
  mobileApi,
  clientApi,
  tokenApi,
  dpopClientApi,
  serverApi,
);

const relayServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { relayPublicOrigin, stage } = yield* SelfHostDeploymentConfig;
    const managedEndpointBaseDomain = yield* Config.string("RELAY_TUNNEL_ZONE_NAME").pipe(
      Config.option,
    );

    const environment = yield* Config.schema(
      RelayConfiguration.ApnsEnvironment,
      "APNS_ENVIRONMENT",
    );
    const apnsTeamId = yield* Config.string("APNS_TEAM_ID");
    const apnsKeyId = yield* Config.string("APNS_KEY_ID");
    const apnsBundleId = yield* Config.string("APNS_BUNDLE_ID");
    const apnsPrivateKey = yield* Config.redacted("APNS_PRIVATE_KEY");
    const apnsDeliveryJobSigningSecret = yield* ApnsDeliveryJobSigningSecret;

    // Clerk is not configured on self-host — Alter OIDC is the only auth path.
    const oidcIssuer = yield* Config.string("ALTER_OIDC_ISSUER").pipe(Config.option);
    const oidcClientId = yield* Config.string("ALTER_OIDC_CLIENT_ID").pipe(Config.option);
    const oidcJwksUri = yield* Config.string("ALTER_OIDC_JWKS_URI").pipe(Config.option);

    const cloudMintKeys = yield* CloudMintKeys;

    const relayConfiguration = RelayConfiguration.RelayConfiguration.of({
      relayIssuer: relayPublicOrigin,
      apns: {
        environment,
        teamId: apnsTeamId,
        keyId: apnsKeyId,
        bundleId: apnsBundleId,
        privateKey: apnsPrivateKey,
      },
      apnsDeliveryJobSigningSecret,
      clerkSecretKey: Redacted.make(""),
      clerkPublishableKey: "",
      clerkJwtAudience: "",
      ...(Option.isSome(oidcIssuer) ? { oidcIssuer: oidcIssuer.value } : {}),
      ...(Option.isSome(oidcClientId) ? { oidcClientId: oidcClientId.value } : {}),
      ...(Option.isSome(oidcJwksUri) ? { oidcJwksUri: oidcJwksUri.value } : {}),
      cloudMintPrivateKey: cloudMintKeys.privateKey,
      cloudMintPublicKey: cloudMintKeys.publicKey,
      // Managed endpoint (per-environment auto-provisioned tunnels) is only
      // active once RELAY_TUNNEL_ZONE_NAME is set — see
      // ManagedEndpointProvider.ts's requireCloudflareSettings, which bails
      // gracefully with ManagedEndpointProvisioningNotConfigured otherwise.
      managedEndpointBaseDomain: Option.getOrUndefined(managedEndpointBaseDomain),
      managedEndpointNamespace: stage,
    });

    // Named separately (rather than written inline in the provideMerge
    // chain below) so tsgo fully resolves each composite's type on its own
    // before it's folded into the long chain — inline composites here were
    // producing incomplete inferred types that leaked as phantom missing
    // services several steps later.
    const managedEndpointProviderLive = ManagedEndpointProvider.layer.pipe(
      Layer.provide(managedEndpointCloudflareLayer),
    );
    const apnsClientLive = ApnsClient.layer.pipe(Layer.provideMerge(ApnsProviderTokens.layer));
    const apnsDeliveryQueueLive = ApnsDeliveryQueue.layer.pipe(Layer.provide(localApnsSenderLayer));
    const relayTransactionsLive = RelayDb.RelayTransactions.layer.pipe(
      Layer.provideMerge(RelayDbLive),
    );
    const environmentAllocationLayers = Layer.mergeAll(
      EnvironmentLinks.layer,
      ManagedEndpointAllocations.layer,
      ManagedTunnelLimits.layer,
    );
    const relayConfigurationLive = Layer.succeed(
      RelayConfiguration.RelayConfiguration,
      relayConfiguration,
    );

    const runtimeLayer = Layer.empty.pipe(
      Layer.provideMerge(MobileRegistrations.layer),
      Layer.provideMerge(AgentActivityPublisher.layer),
      Layer.provideMerge(EnvironmentConnector.layer),
      Layer.provideMerge(EnvironmentLinker.layer),
      Layer.provideMerge(EnvironmentPublishSignatures.layer),
      Layer.provideMerge(managedEndpointProviderLive),
      Layer.provideMerge(DpopProofs.layer),
      Layer.provideMerge(ApnsDeliveries.layer),
      Layer.provideMerge(apnsClientLive),
      // `apnsDeliveryQueueLive` still requires `LocalApnsQueue`
      // (localApnsSenderLayer's own dependency isn't discharged by
      // `Layer.provide`, only merged into the requirement) —
      // `provideMerge` only feeds a dependency's output *backward* into
      // everything already accumulated, never forward, so
      // `localApnsQueueLayer` has to come after this, not before it.
      Layer.provideMerge(apnsDeliveryQueueLive),
      Layer.provideMerge(localApnsQueueLayer),
      // AgentActivityRows/Devices grouped — both only need RelayDb, no
      // cross-dependency on each other, and grouping keeps this chain at
      // exactly 20 `provideMerge` steps (`pipe`'s overload ceiling).
      Layer.provideMerge(Layer.mergeAll(AgentActivityRows.layer, Devices.layer)),
      Layer.provideMerge(EnvironmentCredentials.layer),
      Layer.provideMerge(environmentAllocationLayers),
      Layer.provideMerge(LiveActivities.layer),
      Layer.provideMerge(DeliveryAttempts.layer),
      Layer.provideMerge(RelayTokens.layer),
      Layer.provideMerge(relayTransactionsLive),
      Layer.provideMerge(relayConfigurationLive),
      // Fed last, like worker.ts's webcryptoLayer: `provideMerge` satisfies
      // the *accumulator so far*'s outstanding requirements from what's
      // added next, not the other way round, so anything many earlier
      // layers depend on (HttpClient, here) has to go at the end of the
      // chain to actually reach them.
      Layer.provideMerge(FetchHttpClient.layer),
    );

    const appLayer = relayApiLayer.pipe(
      Layer.provideMerge(relayClientAuthLayer),
      Layer.provideMerge(relayDpopClientAuthLayer),
      Layer.provideMerge(relayEnvironmentAuthLayer),
      Layer.provide(runtimeLayer),
    );

    const relayRouterLayer = Layer.mergeAll(
      HttpApiBuilder.layer(RelayApi, { openapiPath: "/openapi.json" }).pipe(
        Layer.provide(appLayer),
      ),
      HttpApiScalar.layer(RelayApi, { path: "/docs" }),
      relayDocsRedirectRoute,
      oidcTokenExchangeRoute,
      relayNotFoundRoute,
    ).pipe(
      Layer.provide([Etag.layerWeak, relayCors]),
      // `HttpApiBuilder` tracks services a handler body `yield*`s directly
      // (not via HttpApiMiddleware) as per-request `Request<"Requires", _>`
      // dependencies — a separate type channel from ordinary Layer R that
      // plain `Layer.provide(appLayer)` above doesn't clear. Cloudflare's
      // `Worker` wrapper (worker.ts) apparently discharges this
      // automatically; Node's `HttpRouter.serve` doesn't, so it needs
      // `provideRequest` explicitly.
      HttpRouter.provideRequest(runtimeLayer),
    );

    const apnsConsumerLayer = Layer.effectDiscard(
      Effect.forkScoped(runLocalApnsConsumer.pipe(Effect.provide(runtimeLayer))),
    );

    const pruneCronLayer = Layer.effectDiscard(
      Effect.forkScoped(
        DpopProofs.DpopProofReplay.pipe(
          Effect.flatMap((dpopProofs) => dpopProofs.pruneExpired),
          Effect.andThen(
            Effect.all([AgentActivityRows.AgentActivityRows, DateTime.now]).pipe(
              Effect.flatMap(([activityRows, now]) =>
                activityRows.pruneTerminal({
                  updatedBefore: DateTime.formatIso(DateTime.subtract(now, { minutes: 30 })),
                }),
              ),
            ),
          ),
          Effect.withSpan("relay.selfhost.cron.prune_expired_state"),
          Effect.provide(runtimeLayer),
          Effect.catch((error: unknown) =>
            Effect.logError("relay.selfhost.cron_prune_failed", { error }),
          ),
          Effect.repeat(Schedule.fixed("5 minutes")),
        ),
      ),
    );

    return Layer.mergeAll(relayRouterLayer, apnsConsumerLayer, pruneCronLayer);
  }),
);

// Dynamically imported, matching apps/server/src/server.ts's HttpServerLive —
// avoids a static `node:http` import outside the platform-node package.
const NodeHttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.int("PORT").pipe(Config.withDefault(8787));
    const host = yield* Config.string("HOST").pipe(Config.withDefault("0.0.0.0"));
    const [NodeHttpServer, NodeHttp] = yield* Effect.all([
      Effect.promise(() => import("@effect/platform-node/NodeHttpServer")),
      Effect.promise(() => import("node:http")),
    ]);
    return NodeHttpServer.layer(() => NodeHttp.createServer(), { port, host });
  }),
);

const program = HttpRouter.serve(relayServerLayer).pipe(
  Layer.provide(NodeHttpServerLive),
  Layer.provide(NodeServices.layer),
);

NodeRuntime.runMain(Layer.launch(program));
