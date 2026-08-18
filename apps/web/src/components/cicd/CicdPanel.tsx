import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { Activity, Link2, Plus, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { cn } from "~/lib/utils";

type Connection = {
  id: string;
  provider: "dokploy";
  name: string;
  baseUrl: string;
  createdAt: string;
};

export function CicdPanel({
  environmentId,
  projectId,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = useAtomQueryRunner(projectEnvironment.cicdConnectionsList, { reportFailure: false });
  const projectConnection = useAtomQueryRunner(projectEnvironment.cicdProjectConnectionGet, {
    reportFailure: false,
  });
  const create = useAtomCommand(projectEnvironment.cicdConnectionsCreate, { reportFailure: false });
  const remove = useAtomCommand(projectEnvironment.cicdConnectionsDelete, { reportFailure: false });
  const setProject = useAtomCommand(projectEnvironment.cicdProjectConnectionSet, {
    reportFailure: false,
  });

  const refresh = useCallback(async () => {
    const [connectionResult, projectResult] = await Promise.all([
      list({ environmentId, input: {} }),
      projectConnection({ environmentId, input: { projectId } }),
    ]);
    if (connectionResult._tag === "Success")
      setConnections([...connectionResult.value.connections] as Connection[]);
    if (projectResult._tag === "Success") setSelectedId(projectResult.value.connectionId);
  }, [environmentId, list, projectConnection, projectId]);

  useEffect(() => void refresh(), [refresh]);

  const selectConnection = async (connectionId: string | null) => {
    setSelectedId(connectionId);
    const result = await setProject({ environmentId, input: { projectId, connectionId } });
    if (result._tag === "Failure") setError("Project connection could not be saved.");
  };

  const createConnection = async () => {
    if (!name.trim() || !baseUrl.trim() || !token.trim()) {
      setError("Name, URL, and API token are required.");
      return;
    }
    const result = await create({
      environmentId,
      input: {
        provider: "dokploy",
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        token: token.trim(),
      },
    });
    if (result._tag === "Success") {
      setConnections([...result.value.connections] as Connection[]);
      const created = result.value.connections.at(-1);
      if (created) await selectConnection(created.id);
      setName("");
      setBaseUrl("https://");
      setToken("");
      setShowForm(false);
      setError(null);
    } else setError("Dokploy connection could not be created.");
  };

  const deleteConnection = async (id: string) => {
    const result = await remove({ environmentId, input: { id } });
    if (result._tag === "Success") {
      setConnections([...result.value.connections] as Connection[]);
      if (selectedId === id) await selectConnection(null);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="size-4" /> CI/CD
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Reusable deployment connections for this project.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((value) => !value)}>
          <Plus className="mr-1 size-4" /> Dokploy
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {showForm ? (
          <div className="mb-4 rounded-lg border bg-muted/20 p-3">
            <div className="mb-3 text-sm font-medium">Add Dokploy connection</div>
            <div className="grid gap-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production Dokploy"
              />
              <Input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://dokploy.example.com"
              />
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="API token"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void createConnection()}>Save connection</Button>
              </div>
            </div>
          </div>
        ) : null}
        {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}
        {connections.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No Dokploy connections yet.
            <br />
            Add one to make it reusable across workspaces.
          </div>
        ) : (
          <div className="grid gap-2">
            {connections.map((connection) => {
              const selected = selectedId === connection.id;
              return (
                <div
                  key={connection.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3",
                    selected && "border-primary bg-primary/5",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => void selectConnection(selected ? null : connection.id)}
                  >
                    <span className="rounded-md bg-muted p-2">
                      <Link2 className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{connection.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {connection.baseUrl}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {selected ? "Assigned" : "Select"}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Delete ${connection.name}`}
                      onClick={() => void deleteConnection(connection.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 rounded-lg border p-3 text-xs text-muted-foreground">
          <Zap className="mb-2 size-4" />
          The token is kept by the server secure store. Projects only retain the selected connection
          ID.
        </div>
      </div>
    </section>
  );
}
