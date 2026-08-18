import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const F1_GITIGNORE_ENTRY = ".f1/";

const isF1GitignoreEntry = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed === ".f1" || trimmed === ".f1/" || trimmed === "/.f1" || trimmed === "/.f1/";
};

/** Ensures local F1 workspace state is ignored without changing existing rules. */
export const ensureF1Gitignore = Effect.fn("ensureF1Gitignore")(function* (workspaceRoot: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const exists = yield* fileSystem.exists(gitignorePath);
  const existing = exists ? yield* fileSystem.readFileString(gitignorePath) : "";

  if (existing.split(/\r?\n/).some(isF1GitignoreEntry)) {
    return false;
  }

  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const separator =
    existing.length > 0 && !existing.endsWith("\n") && !existing.endsWith("\r") ? newline : "";
  yield* fileSystem.writeFileString(
    gitignorePath,
    `${existing}${separator}${F1_GITIGNORE_ENTRY}${newline}`,
  );
  return true;
});
