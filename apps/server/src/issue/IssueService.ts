// @effect-diagnostics nodeBuiltinImport:off - provider CLIs are the existing server integration boundary.
// @effect-diagnostics globalFetchInEffect:off - Bitbucket is the existing direct HTTP provider boundary.
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  PullRequestOperationError,
  type IssueCommentInput,
  type IssueDetail,
  type IssueListEntry,
  type IssueListResult,
  type IssueRef,
} from "@t3tools/contracts";
import { repositoryIdentityOf } from "../pullRequest/PullRequestService.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";

const execFileAsync = promisify(execFile);

export type IssueServiceError = PullRequestOperationError;

export class IssueService extends Context.Service<
  IssueService,
  {
    readonly list: (input: {
      readonly projectId: string;
    }) => Effect.Effect<IssueListResult, IssueServiceError>;
    readonly detail: (input: IssueRef) => Effect.Effect<IssueDetail, IssueServiceError>;
    readonly comment: (input: IssueCommentInput) => Effect.Effect<void, IssueServiceError>;
  }
>()("t3/issue/IssueService") {}

type RawIssue = Record<string, unknown>;

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const number = (value: unknown) => (typeof value === "number" ? value : Number(value));
const iso = (value: unknown) => text(value, "1970-01-01T00:00:00.000Z");
const nestedText = (value: unknown, key: string) =>
  value && typeof value === "object" ? text((value as RawIssue)[key]) : "";
const failure = (operation: string, cause: unknown) =>
  new PullRequestOperationError({ operation, detail: "Issue provider request failed.", cause });

function mapIssue(
  raw: RawIssue,
  projectId: string,
  repository: string,
  provider: IssueListEntry["provider"],
): IssueListEntry {
  const author =
    raw.author && typeof raw.author === "object"
      ? text(
          (raw.author as RawIssue).login ??
            (raw.author as RawIssue).username ??
            (raw.author as RawIssue).display_name,
        )
      : text(raw.author);
  const labels = Array.isArray(raw.labels)
    ? raw.labels
        .map((label) => (typeof label === "string" ? label : text((label as RawIssue).name)))
        .filter(Boolean)
    : [];
  return {
    provider,
    projectId: projectId as IssueListEntry["projectId"],
    repository,
    number: number(raw.number ?? raw.iid ?? raw.id) as IssueListEntry["number"],
    title: text(raw.title, "Untitled issue"),
    url: text(
      raw.url ??
        raw.web_url ??
        nestedText(
          raw.links && typeof raw.links === "object" ? (raw.links as RawIssue).html : undefined,
          "href",
        ),
    ),
    state: text(raw.state, "open").toLowerCase() === "closed" ? "closed" : "open",
    author: author || null,
    labels,
    updatedAt: iso(raw.updatedAt ?? raw.updated_at ?? raw.updated_on),
  };
}

const run = (command: string, args: readonly string[], cwd: string) =>
  Effect.tryPromise({
    try: () =>
      execFileAsync(command, [...args], { cwd, maxBuffer: 8 * 1024 * 1024 }).then(
        ({ stdout }) => JSON.parse(stdout) as unknown,
      ),
    catch: (cause) => failure(`${command} issue request`, cause),
  });

const bitbucketRequest = (url: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: async () => {
      const headers = new Headers(init?.headers);
      const token = process.env.T3CODE_BITBUCKET_ACCESS_TOKEN;
      const email = process.env.T3CODE_BITBUCKET_EMAIL;
      const apiToken = process.env.T3CODE_BITBUCKET_API_TOKEN;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      else if (email && apiToken)
        headers.set(
          "Authorization",
          `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        );
      const response = await fetch(url, { ...init, headers });
      if (!response.ok)
        throw failure(
          "bitbucket issue request",
          new Error(`Bitbucket returned ${response.status}`),
        );
      return (await response.json()) as RawIssue;
    },
    catch: (cause) => failure("bitbucket issue request", cause),
  });

export const make = Effect.gen(function* () {
  const projections = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const resolveProject = (projectId: string) =>
    projections.getShellSnapshot().pipe(
      Effect.flatMap((snapshot) => {
        const project = snapshot.projects.find((candidate) => candidate.id === projectId);
        if (!project || !project.repositoryIdentity)
          return Effect.fail(failure("resolve project", "Project repository not found"));
        const provider = project.repositoryIdentity.provider;
        if (provider !== "github" && provider !== "gitlab" && provider !== "bitbucket")
          return Effect.fail(failure("resolve provider", "Issue provider unsupported"));
        const repository = repositoryIdentityOf(project);
        if (!repository)
          return Effect.fail(failure("resolve repository", "Repository identity not found"));
        return Effect.succeed({
          project,
          provider: provider as IssueListEntry["provider"],
          repository,
        });
      }),
      Effect.mapError((error) => failure("resolve project", error)),
    );

  const list = (input: { readonly projectId: string }) =>
    resolveProject(input.projectId).pipe(
      Effect.flatMap(({ project, provider, repository }) => {
        if (provider === "github")
          return run(
            "gh",
            [
              "issue",
              "list",
              "--state",
              "all",
              "--limit",
              "50",
              "--json",
              "number,title,url,state,author,labels,updatedAt",
            ],
            project.workspaceRoot,
          ).pipe(
            Effect.map((raw) => ({
              items: (Array.isArray(raw) ? raw : []).map((item) =>
                mapIssue(item as RawIssue, input.projectId, repository, provider),
              ),
            })),
          );
        if (provider === "gitlab")
          return run(
            "glab",
            ["issue", "list", "--all", "--output", "json", "--per-page", "50"],
            project.workspaceRoot,
          ).pipe(
            Effect.map((raw) => ({
              items: (Array.isArray(raw) ? raw : []).map((item) =>
                mapIssue(item as RawIssue, input.projectId, repository, provider),
              ),
            })),
          );
        const [owner, repo] = repository.split("/");
        return bitbucketRequest(
          `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/issues?pagelen=50`,
        ).pipe(
          Effect.map((raw) => ({
            items: (Array.isArray(raw.values) ? raw.values : []).map((item) =>
              mapIssue(item, input.projectId, repository, provider),
            ),
          })),
        );
      }),
    );

  const detail = (input: IssueRef) =>
    resolveProject(input.projectId).pipe(
      Effect.flatMap(({ project, provider, repository }) => {
        const mapDetail = (raw: RawIssue, comments: readonly RawIssue[] = []): IssueDetail => ({
          ...mapIssue(raw, input.projectId, repository, provider),
          body: text(raw.body ?? raw.description ?? (raw.content as RawIssue | undefined)?.raw),
          comments: (Array.isArray(raw.comments) ? raw.comments : comments).map((comment) => ({
            author:
              nestedText(comment, "author") ||
              nestedText(comment, "user") ||
              text((comment as RawIssue).author),
            body: text(
              (comment as RawIssue).body ??
                (typeof (comment as RawIssue).content === "object"
                  ? ((comment as RawIssue).content as RawIssue).raw
                  : (comment as RawIssue).content),
            ),
            createdAt: iso(
              (comment as RawIssue).createdAt ??
                (comment as RawIssue).created_at ??
                (comment as RawIssue).created_on,
            ),
          })),
        });
        if (provider === "github")
          return run(
            "gh",
            [
              "issue",
              "view",
              String(input.number),
              "--json",
              "number,title,url,state,author,labels,updatedAt,body,comments",
            ],
            project.workspaceRoot,
          ).pipe(Effect.map((raw) => mapDetail(raw as RawIssue)));
        if (provider === "gitlab")
          return run(
            "glab",
            ["issue", "view", String(input.number), "--output", "json"],
            project.workspaceRoot,
          ).pipe(Effect.map((raw) => mapDetail(raw as RawIssue)));
        const [owner, repo] = repository.split("/");
        const issueUrl = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/issues/${input.number}`;
        return Effect.all({
          issue: bitbucketRequest(issueUrl),
          comments: bitbucketRequest(`${issueUrl}/comments?pagelen=50`),
        }).pipe(
          Effect.map(({ issue, comments }) =>
            mapDetail(issue, Array.isArray(comments.values) ? comments.values : []),
          ),
        );
      }),
    );

  const comment = (input: IssueCommentInput) =>
    resolveProject(input.projectId).pipe(
      Effect.flatMap(({ project, provider, repository }) => {
        if (provider === "github")
          return run(
            "gh",
            ["issue", "comment", String(input.number), "--body", input.body],
            project.workspaceRoot,
          ).pipe(Effect.asVoid);
        if (provider === "gitlab")
          return run(
            "glab",
            ["issue", "note", String(input.number), input.body],
            project.workspaceRoot,
          ).pipe(Effect.asVoid);
        const [owner, repo] = repository.split("/");
        return bitbucketRequest(
          `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/issues/${input.number}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: { raw: input.body } }),
          },
        ).pipe(Effect.asVoid);
      }),
    );

  return IssueService.of({ list, detail, comment });
});

export const layer = Layer.effect(IssueService, make);
