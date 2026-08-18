import * as Schema from "effect/Schema";
import { IsoDateTime, PositiveInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { SourceControlProviderKind } from "./sourceControl.ts";

export const IssueState = Schema.Literals(["open", "closed"]);
export type IssueState = typeof IssueState.Type;

export const IssueRef = Schema.Struct({
  projectId: ProjectId,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
});
export type IssueRef = typeof IssueRef.Type;

export const IssueComment = Schema.Struct({
  author: Schema.NullOr(TrimmedNonEmptyString),
  body: Schema.String,
  createdAt: IsoDateTime,
});
export type IssueComment = typeof IssueComment.Type;

export const IssueListEntry = Schema.Struct({
  provider: SourceControlProviderKind,
  projectId: ProjectId,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: IssueState,
  author: Schema.NullOr(TrimmedNonEmptyString),
  labels: Schema.Array(TrimmedNonEmptyString),
  updatedAt: IsoDateTime,
});
export type IssueListEntry = typeof IssueListEntry.Type;

export const IssueListResult = Schema.Struct({
  items: Schema.Array(IssueListEntry),
});
export type IssueListResult = typeof IssueListResult.Type;

export const IssueListInput = Schema.Struct({ projectId: ProjectId });
export type IssueListInput = typeof IssueListInput.Type;

export const IssueDetail = Schema.Struct({
  ...IssueListEntry.fields,
  body: Schema.String,
  comments: Schema.Array(IssueComment),
});
export type IssueDetail = typeof IssueDetail.Type;

export const IssueCommentInput = Schema.Struct({
  ...IssueRef.fields,
  body: Schema.String.check(Schema.isNonEmpty()).check(Schema.isMaxLength(65_536)),
});
export type IssueCommentInput = typeof IssueCommentInput.Type;
