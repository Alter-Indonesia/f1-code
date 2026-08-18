import type { EnvironmentId, IssueListEntry, ProjectId } from "@t3tools/contracts";
import { useState } from "react";
import { CircleDot, Search } from "lucide-react";
import { issueEnvironment } from "~/state/issues";
import { useEnvironmentQuery } from "~/state/query";
import { Input } from "../ui/input";
import { IssuePanel } from "./IssuePanel";

export function IssueListPanel({
  environmentId,
  projectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
}) {
  const query = useEnvironmentQuery(
    issueEnvironment.list({
      environmentId,
      input: { projectId: projectId as ProjectId },
    }),
  );
  const [selected, setSelected] = useState<IssueListEntry | null>(null);
  const [search, setSearch] = useState("");
  const items = (query.data?.items ?? []).filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );
  if (selected)
    return (
      <IssuePanel
        environmentId={environmentId}
        projectId={projectId}
        repository={selected.repository}
        issue={selected}
      />
    );
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Issues</h2>
        <div className="relative mt-3">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issues"
          />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-3">
        {items.map((item) => (
          <button
            key={item.number}
            type="button"
            className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-muted"
            onClick={() => setSelected(item)}
          >
            <CircleDot
              className={`mt-0.5 size-4 shrink-0 ${item.state === "open" ? "text-emerald-500" : "text-muted-foreground"}`}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                #{item.number} · {item.author ?? "Unknown"}
              </span>
            </span>
          </button>
        ))}
        {!query.isPending && items.length === 0 ? (
          <p className="p-5 text-center text-sm text-muted-foreground">No issues found.</p>
        ) : null}
      </main>
    </div>
  );
}
