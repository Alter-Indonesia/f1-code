/**
 * Runs the relay's Postgres migrations (`infra/relay/migrations/postgres`)
 * against `DATABASE_URL`. Upstream applies these via Alchemy's
 * `Planetscale.PostgresDatabase`/`PostgresBranch` migrationsDir at deploy
 * time; self-host has no Alchemy deploy step, so this runs it directly.
 *
 *   DATABASE_URL=postgres://... node -- scripts/migrate.ts
 */
import * as PgClient from "@effect/sql-pg/PgClient";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";

const program = Effect.gen(function* () {
  const db = yield* PgDrizzle.makeWithDefaults();
  yield* migrate(db, {
    migrationsFolder: new URL("../migrations/postgres", import.meta.url).pathname,
    migrationsTable: "relay_migrations",
  });
  yield* Effect.log("Relay Postgres migrations applied.");
}).pipe(
  Effect.provide(
    Layer.unwrap(
      Config.redacted("DATABASE_URL").pipe(
        Config.map((url) => PgClient.layer({ url, applicationName: "f1code-relay-migrate" })),
      ),
    ),
  ),
);

NodeRuntime.runMain(program);
