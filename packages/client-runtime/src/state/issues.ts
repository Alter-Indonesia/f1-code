import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export function createIssueEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:list",
      tag: WS_METHODS.issuesList,
      staleTimeMs: 30_000,
    }),
    detail: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:detail",
      tag: WS_METHODS.issuesDetail,
      staleTimeMs: 15_000,
    }),
    comment: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:comment",
      tag: WS_METHODS.issuesComment,
    }),
  };
}
