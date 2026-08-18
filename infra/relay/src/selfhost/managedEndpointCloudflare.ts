import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import {
  ManagedEndpointDnsClient,
  ManagedEndpointDnsClientError,
  ManagedEndpointTunnelClient,
  ManagedEndpointTunnelClientError,
} from "../environments/ManagedEndpointProvider.ts";

/**
 * Real Cloudflare-backed implementation of managed-endpoint provisioning,
 * replacing `selfhost/managedEndpointDisabled.ts`. Talks to Cloudflare's
 * REST API directly with a plain bearer token — the same operations
 * `ManagedEndpointProvider.ts`'s Cloudflare-Worker path performs through
 * Alchemy's bindings, just called over HTTP instead of through Alchemy's
 * Worker-bound client objects.
 *
 * Needs `CLOUDFLARE_API_TOKEN` scoped to `Account > Cloudflare Tunnel > Edit`
 * (account-level, for the tunnel endpoints) and `Zone > DNS > Edit` on
 * whichever zone `CLOUDFLARE_ZONE_ID` points at (for the DNS endpoints).
 *
 * `ManagedEndpointTunnelClient`/`ManagedEndpointDnsClient`'s methods have no
 * requirements channel (`Effect.Effect<A, Error>`, R = never) — so unlike
 * most other selfhost layers, `HttpClient` and config have to be resolved
 * *once* here at layer-construction time (inside `Layer.effect`) and closed
 * over, not re-yielded per call.
 */

class CloudflareApiCallError extends Schema.ErrorClass<CloudflareApiCallError>(
  "t3code-relay/selfhost/managedEndpointCloudflare/CloudflareApiCallError",
)({
  method: Schema.String,
  path: Schema.String,
  message: Schema.String,
}) {}

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareApiResult<A> {
  readonly success: boolean;
  readonly result: A;
  readonly errors: ReadonlyArray<{ readonly code: number; readonly message: string }>;
}

const makeCloudflareRequest =
  (httpClient: HttpClient.HttpClient, apiToken: Redacted.Redacted<string>) =>
  <A>(input: {
    readonly method: "GET" | "POST" | "PUT" | "DELETE";
    readonly path: string;
    readonly body?: unknown;
  }): Effect.Effect<A, CloudflareApiCallError> =>
    Effect.gen(function* () {
      let request = HttpClientRequest.make(input.method)(
        `${CLOUDFLARE_API_BASE}${input.path}`,
      ).pipe(HttpClientRequest.bearerToken(apiToken), HttpClientRequest.acceptJson);
      if (input.body !== undefined) {
        request = yield* HttpClientRequest.bodyJson(request, input.body);
      }
      const response = yield* httpClient.execute(request);
      const parsed = (yield* response.json) as unknown as CloudflareApiResult<A>;
      if (!parsed.success) {
        return yield* new CloudflareApiCallError({
          method: input.method,
          path: input.path,
          message:
            parsed.errors.map((e) => `${e.code}: ${e.message}`).join(", ") || "unknown error",
        });
      }
      return parsed.result;
    }).pipe(
      Effect.mapError((cause) =>
        Schema.is(CloudflareApiCallError)(cause)
          ? cause
          : new CloudflareApiCallError({
              method: input.method,
              path: input.path,
              message: String(cause),
            }),
      ),
    );

export const tunnelClientLayer = Layer.effect(
  ManagedEndpointTunnelClient,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const apiToken = yield* Config.redacted("CLOUDFLARE_API_TOKEN");
    const accountId = yield* Config.nonEmptyString("CLOUDFLARE_ACCOUNT_ID");
    const request = makeCloudflareRequest(httpClient, apiToken);

    return ManagedEndpointTunnelClient.of({
      list: (input) =>
        request<ReadonlyArray<{ readonly id: string; readonly name: string }>>({
          method: "GET",
          path: `/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(input.name)}&is_deleted=false`,
        }).pipe(
          Effect.map((records) => ({ result: records })),
          Effect.mapError(
            (cause) =>
              new ManagedEndpointTunnelClientError({
                operation: "list",
                tunnelName: input.name,
                cause,
              }),
          ),
        ),
      create: (input) =>
        request<{ readonly id: string; readonly name: string }>({
          method: "POST",
          path: `/accounts/${accountId}/cfd_tunnel`,
          body: { name: input.name, config_src: input.configSrc },
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointTunnelClientError({
                operation: "create",
                tunnelName: input.name,
                cause,
              }),
          ),
        ),
      putConfiguration: (tunnelId, config) =>
        request({
          method: "PUT",
          path: `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
          body: { config: { ingress: config.ingress } },
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointTunnelClientError({
                operation: "put-configuration",
                tunnelId,
                cause,
              }),
          ),
        ),
      getToken: (tunnelId) =>
        request<string>({
          method: "GET",
          path: `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointTunnelClientError({ operation: "get-token", tunnelId, cause }),
          ),
        ),
      delete: (tunnelId) =>
        request({
          method: "DELETE",
          path: `/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointTunnelClientError({ operation: "delete", tunnelId, cause }),
          ),
        ),
    });
  }),
);

export const dnsClientLayer = Layer.effect(
  ManagedEndpointDnsClient,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const apiToken = yield* Config.redacted("CLOUDFLARE_API_TOKEN");
    const zoneId = yield* Config.nonEmptyString("CLOUDFLARE_ZONE_ID");
    const request = makeCloudflareRequest(httpClient, apiToken);

    return ManagedEndpointDnsClient.of({
      listRecords: (hostname) =>
        request<ReadonlyArray<{ readonly id: string }>>({
          method: "GET",
          path: `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointDnsClientError({ operation: "list-records", hostname, cause }),
          ),
        ),
      createRecord: (input) =>
        request<{ readonly id: string }>({
          method: "POST",
          path: `/zones/${zoneId}/dns_records`,
          body: input,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointDnsClientError({
                operation: "create-record",
                hostname: input.name,
                cause,
              }),
          ),
        ),
      updateRecord: (dnsRecordId, input) =>
        request({
          method: "PUT",
          path: `/zones/${zoneId}/dns_records/${dnsRecordId}`,
          body: input,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointDnsClientError({ operation: "update-record", dnsRecordId, cause }),
          ),
        ),
      deleteRecord: (dnsRecordId) =>
        request({
          method: "DELETE",
          path: `/zones/${zoneId}/dns_records/${dnsRecordId}`,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ManagedEndpointDnsClientError({ operation: "delete-record", dnsRecordId, cause }),
          ),
        ),
    });
  }),
);

export const layer = Layer.mergeAll(tunnelClientLayer, dnsClientLayer);
