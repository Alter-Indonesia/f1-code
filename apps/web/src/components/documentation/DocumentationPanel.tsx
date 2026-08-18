import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { FileText, LoaderCircle, Plus, Save, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { cn } from "~/lib/utils";

interface DocumentationPanelProps {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}

type DocumentationEntry = {
  path: string;
  kind: "file" | "directory";
  byteLength: number;
  modifiedAt: string;
};

const encodeFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });

export function DocumentationPanel({ environmentId, projectId }: DocumentationPanelProps) {
  const [entries, setEntries] = useState<DocumentationEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contents, setContents] = useState("");
  const [noteName, setNoteName] = useState("notes/new-note.md");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runList = useAtomQueryRunner(projectEnvironment.documentationList, {
    reportFailure: false,
  });
  const runRead = useAtomQueryRunner(projectEnvironment.documentationRead, {
    reportFailure: false,
  });
  const write = useAtomCommand(projectEnvironment.documentationWrite, { reportFailure: false });
  const upload = useAtomCommand(projectEnvironment.documentationUpload, { reportFailure: false });
  const remove = useAtomCommand(projectEnvironment.documentationDelete, { reportFailure: false });

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await runList({ environmentId, input: { projectId } });
    if (result._tag === "Success") {
      setEntries([...result.value.entries]);
      setError(null);
    } else {
      setError("Documentation could not be loaded.");
    }
    setLoading(false);
  }, [environmentId, projectId, runList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectFile = async (path: string) => {
    setSelectedPath(path);
    const result = await runRead({ environmentId, input: { projectId, relativePath: path } });
    if (result._tag === "Success") {
      setContents(result.value.truncated ? "File is too large to preview." : result.value.contents);
      setError(null);
    } else {
      setError("Documentation file could not be read.");
    }
  };

  const save = async () => {
    if (!selectedPath) return;
    setSaving(true);
    const result = await write({
      environmentId,
      input: { projectId, relativePath: selectedPath, contents },
    });
    setSaving(false);
    if (result._tag === "Success") await refresh();
    else setError("Documentation file could not be saved.");
  };

  const createNote = async () => {
    const path = noteName.trim();
    if (!path || !path.endsWith(".md")) {
      setError("Note name must end with .md.");
      return;
    }
    // Open the Markdown editor immediately. The file write is persisted in
    // the background so a slow remote environment never makes the button
    // appear unresponsive.
    const initialContents = "# New note\n\n";
    setSelectedPath(path);
    setContents(initialContents);
    setError(null);
    setSaving(true);
    const result = await write({
      environmentId,
      input: { projectId, relativePath: path, contents: initialContents },
    });
    setSaving(false);
    if (result._tag === "Success") {
      await refresh();
    } else setError("Note could not be created.");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const base64 = await encodeFile(file);
    const result = await upload({
      environmentId,
      input: { projectId, relativePath: file.name, contentsBase64: base64 },
    });
    if (result._tag === "Success") await refresh();
    else setError("File could not be uploaded.");
  };

  const deleteSelected = async () => {
    if (!selectedPath) return;
    const result = await remove({
      environmentId,
      input: { projectId, relativePath: selectedPath },
    });
    if (result._tag === "Success") {
      setSelectedPath(null);
      setContents("");
      await refresh();
    } else setError("Documentation file could not be deleted.");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-medium text-sm">Documentation</h2>
          <p className="text-muted-foreground text-xs">Private files stored for this project.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={createNote} disabled={saving}>
            <Plus className="size-3.5" /> Note
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" /> Upload
          </Button>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            onChange={(event) => void onUpload(event)}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="w-52 shrink-0 border-r">
          <div className="space-y-1 p-2">
            <div className="mb-2 flex gap-1">
              <Input
                value={noteName}
                onChange={(event) => setNoteName(event.target.value)}
                placeholder="notes/name.md"
                className="h-7 text-xs"
              />
            </div>
            {loading ? (
              <LoaderCircle className="mx-auto my-6 size-4 animate-spin text-muted-foreground" />
            ) : null}
            {!loading && entries.length === 0 ? (
              <p className="p-2 text-muted-foreground text-xs">No documentation yet.</p>
            ) : null}
            {entries
              .filter((entry) => entry.kind === "file")
              .map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => void selectFile(entry.path)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent",
                    selectedPath === entry.path && "bg-accent text-foreground",
                  )}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{entry.path}</span>
                </button>
              ))}
          </div>
        </ScrollArea>
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedPath ? (
            <>
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="truncate font-mono text-xs">{selectedPath}</span>
                <div className="flex gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => void deleteSelected()}
                    aria-label="Delete file"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button size="sm" onClick={() => void save()} disabled={saving}>
                    <Save className="size-3.5" /> Save
                  </Button>
                </div>
              </div>
              <textarea
                value={contents}
                onChange={(event) => setContents(event.target.value)}
                className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-xs outline-none"
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground text-sm">
              Select a file or create a Markdown note.
            </div>
          )}
          {error ? <p className="border-t px-4 py-2 text-destructive text-xs">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
