import type { EnvironmentId, IssueListEntry, IssueRef } from "@t3tools/contracts";
import { useState } from "react";
import { MessageSquare, Send, ExternalLink } from "lucide-react";
import { issueEnvironment } from "~/state/issues";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export function IssuePanel({
  environmentId,
  projectId,
  repository,
  issue,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly repository: string;
  readonly issue: IssueListEntry;
}) {
  const reference: IssueRef = {
    projectId: projectId as IssueRef["projectId"],
    repository,
    number: issue.number,
  };
  const query = useEnvironmentQuery(issueEnvironment.detail({ environmentId, input: reference }));
  const comment = useAtomCommand(issueEnvironment.comment, { reportFailure: true });
  const [draft, setDraft] = useState("");
  const detail = query.data;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {issue.provider} · {repository}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            #{issue.number} {issue.title}
          </h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.open(issue.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="size-4" />
          Open
        </Button>
      </header>
      <main className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <p className="whitespace-pre-wrap text-sm leading-6">{detail?.body ?? "Loading issue…"}</p>
        <div className="my-6 h-px bg-border" />
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4" />
          Comments
        </div>
        <div className="mt-4 space-y-3">
          {detail?.comments.map((item, index) => (
            <div key={`${item.createdAt}-${index}`} className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {item.author ?? "Unknown"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t p-4">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment…"
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!draft.trim()}
            onClick={() => {
              void comment({ environmentId, input: { ...reference, body: draft.trim() } });
              setDraft("");
            }}
          >
            <Send className="size-4" />
            Comment
          </Button>
        </div>
      </footer>
    </div>
  );
}
