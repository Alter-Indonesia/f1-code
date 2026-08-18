import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const CicdProvider = Schema.Literal("dokploy");
export type CicdProvider = typeof CicdProvider.Type;

export const CicdConnection = Schema.Struct({
  id: TrimmedNonEmptyString,
  provider: CicdProvider,
  name: TrimmedNonEmptyString,
  baseUrl: Schema.String,
  createdAt: Schema.String,
});
export type CicdConnection = typeof CicdConnection.Type;

export const CicdConnectionListResult = Schema.Struct({
  connections: Schema.Array(CicdConnection),
});
export type CicdConnectionListResult = typeof CicdConnectionListResult.Type;

export const CicdConnectionListInput = Schema.Struct({});
export const CicdConnectionCreateInput = Schema.Struct({
  provider: CicdProvider,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  baseUrl: Schema.String.check(Schema.isMaxLength(2048)),
  token: TrimmedNonEmptyString.check(Schema.isMaxLength(4096)),
});
export const CicdConnectionDeleteInput = Schema.Struct({ id: TrimmedNonEmptyString });

export const CicdProjectConnectionInput = Schema.Struct({ projectId: ProjectId });
export const CicdProjectConnectionSetInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: Schema.NullOr(TrimmedNonEmptyString),
});
export const CicdProjectConnectionResult = Schema.Struct({
  connectionId: Schema.NullOr(TrimmedNonEmptyString),
});
export type CicdProjectConnectionResult = typeof CicdProjectConnectionResult.Type;

export class CicdError extends Schema.TaggedErrorClass<CicdError>()("CicdError", {
  operation: Schema.Literals(["list", "create", "delete", "get-project", "set-project"]),
  message: TrimmedNonEmptyString,
}) {}
