import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  ManagedEndpointDnsClient,
  ManagedEndpointDnsClientError,
  ManagedEndpointTunnelClient,
  ManagedEndpointTunnelClientError,
  layerDnsClient,
  layerTunnelClient,
} from "../environments/ManagedEndpointProvider.ts";

/**
 * Managed-endpoint auto-provisioning (per-environment Cloudflare Tunnels)
 * needs real Cloudflare API access. `ManagedEndpointProvider.make` requires
 * these two services to exist in context regardless of whether provisioning
 * is configured, but `managedEndpointBaseDomain`/`managedEndpointNamespace`
 * being unset (self-host default) makes every call short-circuit with
 * `ManagedEndpointProvisioningNotConfigured` before either client method
 * runs — see `requireCloudflareSettings` in `ManagedEndpointProvider.ts`.
 * These stubs exist only to satisfy that context requirement.
 *
 * Turn managed endpoints on later by replacing this layer with real clients
 * that call the Cloudflare Tunnel/DNS REST APIs directly (the account
 * already has `CLOUDFLARE_API_TOKEN` configured for other services).
 */
export const layer = Layer.mergeAll(
  layerTunnelClient({
    list: () =>
      Effect.fail(
        new ManagedEndpointTunnelClientError({
          operation: "list",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    create: () =>
      Effect.fail(
        new ManagedEndpointTunnelClientError({
          operation: "create",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    putConfiguration: () =>
      Effect.fail(
        new ManagedEndpointTunnelClientError({
          operation: "put-configuration",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    getToken: () =>
      Effect.fail(
        new ManagedEndpointTunnelClientError({
          operation: "get-token",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    delete: () =>
      Effect.fail(
        new ManagedEndpointTunnelClientError({
          operation: "delete",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
  }),
  layerDnsClient({
    listRecords: () =>
      Effect.fail(
        new ManagedEndpointDnsClientError({
          operation: "list-records",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    createRecord: () =>
      Effect.fail(
        new ManagedEndpointDnsClientError({
          operation: "create-record",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    updateRecord: () =>
      Effect.fail(
        new ManagedEndpointDnsClientError({
          operation: "update-record",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
    deleteRecord: () =>
      Effect.fail(
        new ManagedEndpointDnsClientError({
          operation: "delete-record",
          cause: "Managed endpoint provisioning is disabled on this self-hosted relay.",
        }),
      ),
  }),
);

export { ManagedEndpointTunnelClient, ManagedEndpointDnsClient };
