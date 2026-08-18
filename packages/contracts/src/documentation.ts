import * as Schema from "effect/Schema";

import { NonNegativeInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const DocumentationEntryKind = Schema.Literals(["file", "directory"]);
export type DocumentationEntryKind = typeof DocumentationEntryKind.Type;

export const DocumentationEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: DocumentationEntryKind,
  byteLength: NonNegativeInt,
  modifiedAt: Schema.String,
});
export type DocumentationEntry = typeof DocumentationEntry.Type;

export const DocumentationListInput = Schema.Struct({ projectId: ProjectId });
export type DocumentationListInput = typeof DocumentationListInput.Type;

export const DocumentationListResult = Schema.Struct({
  entries: Schema.Array(DocumentationEntry),
});
export type DocumentationListResult = typeof DocumentationListResult.Type;

export const DocumentationReadInput = Schema.Struct({
  projectId: ProjectId,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
});
export type DocumentationReadInput = typeof DocumentationReadInput.Type;

export const DocumentationReadResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  contents: Schema.String,
  byteLength: NonNegativeInt,
  truncated: Schema.Boolean,
});
export type DocumentationReadResult = typeof DocumentationReadResult.Type;

export const DocumentationWriteInput = Schema.Struct({
  projectId: ProjectId,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  contents: Schema.String,
});
export type DocumentationWriteInput = typeof DocumentationWriteInput.Type;

export const DocumentationWriteResult = Schema.Struct({ relativePath: TrimmedNonEmptyString });
export type DocumentationWriteResult = typeof DocumentationWriteResult.Type;

export const DocumentationUploadInput = Schema.Struct({
  projectId: ProjectId,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  contentsBase64: TrimmedNonEmptyString.check(Schema.isMaxLength(14 * 1024 * 1024)),
});
export type DocumentationUploadInput = typeof DocumentationUploadInput.Type;

export const DocumentationDeleteInput = Schema.Struct({
  projectId: ProjectId,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
});
export type DocumentationDeleteInput = typeof DocumentationDeleteInput.Type;

export const DocumentationDeleteResult = Schema.Struct({ relativePath: TrimmedNonEmptyString });
export type DocumentationDeleteResult = typeof DocumentationDeleteResult.Type;

export const DocumentationOperation = Schema.Literals([
  "resolve-project",
  "list",
  "read",
  "write",
  "upload",
  "delete",
]);

export class DocumentationError extends Schema.TaggedErrorClass<DocumentationError>()(
  "DocumentationError",
  {
    operation: DocumentationOperation,
    message: TrimmedNonEmptyString,
  },
) {}
