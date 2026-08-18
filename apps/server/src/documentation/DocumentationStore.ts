// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeOS from "node:os";

import type {
  DocumentationDeleteInput,
  DocumentationDeleteResult,
  DocumentationEntry,
  DocumentationListResult,
  DocumentationReadInput,
  DocumentationReadResult,
  DocumentationUploadInput,
  DocumentationWriteInput,
  DocumentationWriteResult,
  ProjectId,
} from "@t3tools/contracts";
import { DocumentationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const isDocumentationError = Schema.is(DocumentationError);

const slug = (workspaceRoot: string) => {
  const name = workspaceRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
};

const projectKey = (workspaceRoot: string) =>
  NodeCrypto.createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 12);

const asError = (operation: DocumentationError["operation"], cause: unknown) =>
  new DocumentationError({
    operation,
    message:
      cause instanceof Error
        ? cause.message.slice(0, 500) || "Documentation operation failed."
        : "Documentation operation failed.",
  });

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projects = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;

  const projectDirectory = (workspaceRoot: string) =>
    path.join(
      NodeOS.homedir(),
      ".f1",
      `${slug(workspaceRoot)}-${projectKey(workspaceRoot)}`,
      "project_files",
    );

  const resolveProject = (projectId: ProjectId) =>
    projects.getProjectShellById(projectId).pipe(
      Effect.flatMap((project) =>
        Option.isSome(project)
          ? Effect.succeed(project.value.workspaceRoot)
          : Effect.fail(
              new DocumentationError({
                operation: "resolve-project",
                message: "Project not found.",
              }),
            ),
      ),
      Effect.mapError((cause) =>
        isDocumentationError(cause) ? cause : asError("resolve-project", cause),
      ),
    );

  const resolveFile = (root: string, relativePath: string) => {
    const normalized = relativePath.trim().replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (
      !normalized ||
      normalized.startsWith("/") ||
      segments.some((segment) => segment === ".." || segment === "." || segment.length === 0)
    ) {
      return Effect.fail(
        new DocumentationError({ operation: "read", message: "Invalid documentation path." }),
      );
    }
    const documentationRoot = path.resolve(root);
    const absolutePath = path.resolve(documentationRoot, ...segments);
    const relative = path.relative(documentationRoot, absolutePath);
    if (
      relative === "" ||
      relative.startsWith(`..${path.sep}`) ||
      relative === ".." ||
      path.isAbsolute(relative)
    ) {
      return Effect.fail(
        new DocumentationError({
          operation: "read",
          message: "Documentation path escapes its project.",
        }),
      );
    }
    return Effect.succeed({ absolutePath, relativePath: normalized });
  };

  const ensureRoot = (workspaceRoot: string) => {
    const root = projectDirectory(workspaceRoot);
    const f1Root = path.dirname(path.dirname(root));
    return Effect.gen(function* () {
      yield* fileSystem.makeDirectory(f1Root, { recursive: true });
      yield* fileSystem.makeDirectory(root, { recursive: true });
      // Documentation may contain sensitive project material. Keep the store
      // private on POSIX systems; Windows ignores POSIX mode bits safely.
      yield* fileSystem.chmod(f1Root, 0o700).pipe(Effect.catch(() => Effect.void));
      yield* fileSystem.chmod(root, 0o700).pipe(Effect.catch(() => Effect.void));
    });
  };

  const list = (projectId: ProjectId): Effect.Effect<DocumentationListResult, DocumentationError> =>
    Effect.gen(function* () {
      const workspaceRoot = yield* resolveProject(projectId);
      const root = projectDirectory(workspaceRoot);
      yield* ensureRoot(workspaceRoot);
      const names = yield* fileSystem.readDirectory(root, { recursive: true });
      const entries: DocumentationEntry[] = [];
      for (const name of names) {
        const stat = yield* fileSystem.stat(path.join(root, name));
        entries.push({
          path: name.replaceAll("\\", "/"),
          kind: stat.type === "Directory" ? "directory" : "file",
          byteLength: Number(stat.size),
          modifiedAt: Option.match(stat.mtime, {
            onNone: () => "",
            onSome: (mtime) => mtime.toISOString(),
          }),
        });
      }
      return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)) };
    }).pipe(Effect.catch((cause) => Effect.fail(asError("list", cause))));

  const read = (
    input: DocumentationReadInput,
  ): Effect.Effect<DocumentationReadResult, DocumentationError> =>
    Effect.gen(function* () {
      const workspaceRoot = yield* resolveProject(input.projectId);
      const root = projectDirectory(workspaceRoot);
      const target = yield* resolveFile(root, input.relativePath);
      const stat = yield* fileSystem.stat(target.absolutePath);
      if (stat.type !== "File")
        return yield* new DocumentationError({
          operation: "read",
          message: "Documentation path is not a file.",
        });
      if (Number(stat.size) > MAX_READ_BYTES)
        return {
          relativePath: target.relativePath,
          contents: "",
          byteLength: Number(stat.size),
          truncated: true,
        };
      const contents = yield* fileSystem.readFileString(target.absolutePath);
      return {
        relativePath: target.relativePath,
        contents,
        byteLength: Number(stat.size),
        truncated: false,
      };
    }).pipe(Effect.catch((cause) => Effect.fail(asError("read", cause))));

  const write = (
    input: DocumentationWriteInput,
  ): Effect.Effect<DocumentationWriteResult, DocumentationError> =>
    Effect.gen(function* () {
      const workspaceRoot = yield* resolveProject(input.projectId);
      const root = projectDirectory(workspaceRoot);
      const target = yield* resolveFile(root, input.relativePath);
      if (Buffer.byteLength(input.contents, "utf8") > MAX_UPLOAD_BYTES)
        return yield* new DocumentationError({
          operation: "write",
          message: "Documentation note is too large.",
        });
      yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true });
      yield* fileSystem.writeFileString(target.absolutePath, input.contents);
      yield* fileSystem.chmod(target.absolutePath, 0o600).pipe(Effect.catch(() => Effect.void));
      return { relativePath: target.relativePath };
    }).pipe(Effect.catch((cause) => Effect.fail(asError("write", cause))));

  const upload = (
    input: DocumentationUploadInput,
  ): Effect.Effect<DocumentationWriteResult, DocumentationError> =>
    Effect.gen(function* () {
      const workspaceRoot = yield* resolveProject(input.projectId);
      const root = projectDirectory(workspaceRoot);
      const target = yield* resolveFile(root, input.relativePath);
      const bytes = Buffer.from(input.contentsBase64, "base64");
      if (bytes.byteLength > MAX_UPLOAD_BYTES)
        return yield* new DocumentationError({
          operation: "upload",
          message: "Uploaded file is too large.",
        });
      yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true });
      yield* fileSystem.writeFile(target.absolutePath, new Uint8Array(bytes));
      yield* fileSystem.chmod(target.absolutePath, 0o600).pipe(Effect.catch(() => Effect.void));
      return { relativePath: target.relativePath };
    }).pipe(Effect.catch((cause) => Effect.fail(asError("upload", cause))));

  const remove = (
    input: DocumentationDeleteInput,
  ): Effect.Effect<DocumentationDeleteResult, DocumentationError> =>
    Effect.gen(function* () {
      const workspaceRoot = yield* resolveProject(input.projectId);
      const target = yield* resolveFile(projectDirectory(workspaceRoot), input.relativePath);
      yield* fileSystem.remove(target.absolutePath);
      return { relativePath: target.relativePath };
    }).pipe(Effect.catch((cause) => Effect.fail(asError("delete", cause))));

  return { list, read, write, upload, remove };
});
