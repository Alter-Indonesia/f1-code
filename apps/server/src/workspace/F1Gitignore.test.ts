import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ensureF1Gitignore } from "./F1Gitignore.ts";

const TestLayer = Layer.mergeAll(NodeServices.layer);

describe("ensureF1Gitignore", () => {
  it.effect("creates .gitignore with the F1 state directory", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-f1-gitignore-",
      });

      expect(yield* ensureF1Gitignore(workspaceRoot)).toBe(true);
      expect(yield* fileSystem.readFileString(`${workspaceRoot}/.gitignore`)).toBe(".f1/\n");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("preserves existing rules and does not duplicate the entry", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-f1-gitignore-",
      });
      const gitignorePath = path.join(workspaceRoot, ".gitignore");
      yield* fileSystem.writeFileString(gitignorePath, "node_modules/\n.f1/\n");

      expect(yield* ensureF1Gitignore(workspaceRoot)).toBe(false);
      expect(yield* fileSystem.readFileString(gitignorePath)).toBe("node_modules/\n.f1/\n");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("adds a separator when the existing file has no trailing newline", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-f1-gitignore-",
      });
      yield* fileSystem.writeFileString(`${workspaceRoot}/.gitignore`, "node_modules/");

      yield* ensureF1Gitignore(workspaceRoot);
      expect(yield* fileSystem.readFileString(`${workspaceRoot}/.gitignore`)).toBe(
        "node_modules/\n.f1/\n",
      );
    }).pipe(Effect.provide(TestLayer)),
  );
});
