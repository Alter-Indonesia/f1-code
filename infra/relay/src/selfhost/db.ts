import * as PgClient from "@effect/sql-pg/PgClient";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import * as Config from "effect/Config";
import * as Layer from "effect/Layer";

import * as RelayDb from "../db.ts";

/**
 * Plain Postgres connection for self-hosted deployments. Skips Alchemy's
 * Cloudflare Hyperdrive binding entirely — connects straight to
 * `DATABASE_URL` with a managed `pg` pool.
 */
export const RelayDbLive = Layer.effect(RelayDb.RelayDb, PgDrizzle.makeWithDefaults()).pipe(
  Layer.provide(
    Layer.unwrap(
      Config.redacted("DATABASE_URL").pipe(
        Config.map((url) => PgClient.layer({ url, applicationName: "f1code-relay" })),
      ),
    ),
  ),
);
