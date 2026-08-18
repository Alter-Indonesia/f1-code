import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  CicdConnectionCreateInput,
  type CicdConnection,
  type CicdProvider,
} from "@t3tools/contracts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";

const STORE_NAME = "f1-cicd-connections";
const MAX_CONNECTIONS = 100;

type StoredConnection = CicdConnection & { token: string };
type CicdConnectionCreate = typeof CicdConnectionCreateInput.Type;
type StoredState = { connections: StoredConnection[]; projectConnections: Record<string, string> };

const emptyState = (): StoredState => ({ connections: [], projectConnections: {} });

const failure = (
  operation: "list" | "create" | "delete" | "get-project" | "set-project",
  message: string,
) => new Error(`${operation}: ${message}`);

export const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const crypto = yield* Crypto.Crypto;
  const now = yield* DateTime.now;

  const read = Effect.gen(function* () {
    const raw = yield* secrets.get(STORE_NAME);
    if (Option.isNone(raw)) return emptyState();
    const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
      new TextDecoder().decode(raw.value),
    ).pipe(Effect.mapError(() => failure("list", "Stored connection data is invalid.")));
    {
      if (!parsed || typeof parsed !== "object") return emptyState();
      const candidate = parsed as Partial<StoredState>;
      return {
        connections: Array.isArray(candidate.connections) ? candidate.connections : [],
        projectConnections:
          candidate.projectConnections && typeof candidate.projectConnections === "object"
            ? candidate.projectConnections
            : {},
      } satisfies StoredState;
    }
  });

  const write = (state: StoredState) =>
    secrets
      .set(STORE_NAME, new TextEncoder().encode(JSON.stringify(state)))
      .pipe(Effect.mapError((error) => failure("create", error.message)));

  const publicConnections = (state: StoredState): CicdConnection[] =>
    state.connections.map(({ token: _token, ...connection }) => connection);

  return {
    list: read.pipe(Effect.map((state) => publicConnections(state))),
    create: (input: CicdConnectionCreate) =>
      Effect.gen(function* () {
        const state = yield* read;
        if (state.connections.length >= MAX_CONNECTIONS) {
          return yield* Effect.fail(failure("create", "Connection limit reached."));
        }
        const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
        if (!/^https?:\/\//i.test(baseUrl)) {
          return yield* Effect.fail(
            failure("create", "Dokploy URL must start with http:// or https://."),
          );
        }
        const id = yield* crypto.randomUUIDv4;
        const connection: StoredConnection = {
          id,
          provider: input.provider as CicdProvider,
          name: input.name,
          baseUrl,
          token: input.token,
          createdAt: DateTime.formatIso(now),
        };
        const next = { ...state, connections: [...state.connections, connection] };
        yield* write(next);
        return publicConnections(next);
      }).pipe(
        Effect.mapError((error) =>
          failure("create", error instanceof Error ? error.message : String(error)),
        ),
      ),
    remove: (id: string) =>
      Effect.gen(function* () {
        const state = yield* read;
        const connections = state.connections.filter((connection) => connection.id !== id);
        const projectConnections = Object.fromEntries(
          Object.entries(state.projectConnections).filter(
            ([, connectionId]) => connectionId !== id,
          ),
        );
        const next = { connections, projectConnections };
        yield* write(next);
        return publicConnections(next);
      }).pipe(
        Effect.mapError((error) =>
          failure("delete", error instanceof Error ? error.message : String(error)),
        ),
      ),
    getProject: (projectId: string) =>
      read.pipe(Effect.map((state) => state.projectConnections[projectId] ?? null)),
    setProject: (projectId: string, connectionId: string | null) =>
      Effect.gen(function* () {
        const state = yield* read;
        if (
          connectionId !== null &&
          !state.connections.some((connection) => connection.id === connectionId)
        ) {
          return yield* Effect.fail(failure("set-project", "Connection does not exist."));
        }
        const projectConnections = { ...state.projectConnections };
        if (connectionId === null) delete projectConnections[projectId];
        else projectConnections[projectId] = connectionId;
        yield* write({ ...state, projectConnections });
        return connectionId;
      }).pipe(
        Effect.mapError((error) =>
          failure("set-project", error instanceof Error ? error.message : String(error)),
        ),
      ),
  };
});

export type CicdConnectionStore = Effect.Success<typeof make>;
