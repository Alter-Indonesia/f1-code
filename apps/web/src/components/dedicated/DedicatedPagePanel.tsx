import * as Schema from "effect/Schema";
import { ExternalLink, Globe2, MoreHorizontal, Pencil, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TrimmedNonEmptyString, type EnvironmentId, type ProjectId } from "@t3tools/contracts";
import { faviconUrlForOrigin } from "~/lib/favicon";
import { isElectron } from "~/env";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
  useLocalStorage,
} from "~/hooks/useLocalStorage";
import { readLocalApi } from "~/localApi";
import { usePreviewWebviewConfig } from "~/browser/previewWebviewConfigState";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

const DedicatedPageConfig = Schema.Struct({
  url: TrimmedNonEmptyString,
  icon: Schema.Literals(["favicon", "default"]),
});
type DedicatedPageConfig = typeof DedicatedPageConfig.Type;
const DedicatedPageConfigStorage = Schema.NullOr(DedicatedPageConfig);

export type DedicatedPageKind = "notion" | "clickup" | "custom";
export interface DedicatedPageTemplate {
  readonly name: string;
  readonly url: string;
}

const COPY = {
  notion: {
    name: "Notion",
    description: "Open this project's Notion page without browser chrome.",
    fallback: "N",
    fallbackClass: "bg-foreground text-background",
  },
  clickup: {
    name: "ClickUp",
    description: "Open this project's ClickUp page without browser chrome.",
    fallback: "✓",
    fallbackClass: "bg-violet-600 text-white",
  },
  custom: {
    name: "Custom Page",
    description: "Open a custom project page without browser chrome.",
    fallback: "↗",
    fallbackClass: "bg-muted text-foreground",
  },
} as const;

export function dedicatedPageStorageKey(
  environmentId: EnvironmentId,
  projectId: ProjectId,
  kind: DedicatedPageKind,
) {
  return `t3code:dedicated-page:${environmentId}:${projectId}:${kind}:v1`;
}

function dedicatedPageLastUrlKey(
  environmentId: EnvironmentId,
  projectId: ProjectId,
  kind: DedicatedPageKind,
) {
  return `${dedicatedPageStorageKey(environmentId, projectId, kind)}:last-url`;
}

function readDedicatedPageLastUrl(
  environmentId: EnvironmentId,
  projectId: ProjectId,
  kind: DedicatedPageKind,
): string | null {
  try {
    return getLocalStorageItem(
      dedicatedPageLastUrlKey(environmentId, projectId, kind),
      Schema.String,
    );
  } catch {
    return null;
  }
}

function writeDedicatedPageLastUrl(
  environmentId: EnvironmentId,
  projectId: ProjectId,
  kind: DedicatedPageKind,
  url: string,
) {
  try {
    setLocalStorageItem(
      dedicatedPageLastUrlKey(environmentId, projectId, kind),
      url,
      Schema.String,
    );
  } catch {
    // Persistence is best effort; the configured page remains usable if storage is unavailable.
  }
}

export function readDedicatedPageConfig(
  environmentId: EnvironmentId,
  projectId: ProjectId,
  kind: DedicatedPageKind,
): DedicatedPageConfig | null {
  try {
    const raw =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(dedicatedPageStorageKey(environmentId, projectId, kind));
    return raw ? Schema.decodeSync(Schema.fromJsonString(DedicatedPageConfigStorage))(raw) : null;
  } catch {
    return null;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Dedicated page";
  }
}

export function DedicatedPagePanel(props: {
  readonly kind: DedicatedPageKind;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly initialTemplate?: DedicatedPageTemplate;
}) {
  const copy = COPY[props.kind];
  const [config, setConfig] = useLocalStorage<DedicatedPageConfig | null, unknown>(
    dedicatedPageStorageKey(props.environmentId, props.projectId, props.kind),
    null,
    DedicatedPageConfigStorage,
  );
  const [dialogOpen, setDialogOpen] = useState(config === null);
  const [url, setUrl] = useState(config?.url ?? props.initialTemplate?.url ?? "");
  const [icon, setIcon] = useState<DedicatedPageConfig["icon"]>(config?.icon ?? "favicon");
  const [error, setError] = useState<string | null>(null);
  const previewConfig = usePreviewWebviewConfig(props.environmentId);
  const webviewRef = useRef<HTMLElement | null>(null);
  const favicon = useMemo(() => faviconUrlForOrigin(config?.url), [config?.url]);
  const pageUrl = config
    ? (readDedicatedPageLastUrl(props.environmentId, props.projectId, props.kind) ?? config.url)
    : null;
  const pageContent = config ? (
    isElectron ? (
      previewConfig ? (
        <webview
          ref={webviewRef}
          title={`${copy.name} dedicated page`}
          src={pageUrl ?? config.url}
          partition={previewConfig.partition}
          webpreferences={previewConfig.webPreferences}
          {...(previewConfig.preloadUrl ? { preload: previewConfig.preloadUrl } : {})}
          allowpopups={true}
          className="min-h-0 flex-1 border-0 bg-background"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading page…
        </div>
      )
    ) : (
      <iframe
        title={`${copy.name} dedicated page`}
        src={config.url}
        className="min-h-0 flex-1 border-0 bg-background"
      />
    )
  ) : null;

  useEffect(() => {
    const webview = webviewRef.current as (HTMLElement & { src?: string }) | null;
    if (!webview || !isElectron) return;
    const handleNewWindow = (event: Event) => {
      const popupUrl = (event as Event & { url?: string }).url;
      event.preventDefault();
      if (popupUrl) {
        writeDedicatedPageLastUrl(props.environmentId, props.projectId, props.kind, popupUrl);
        webview.src = popupUrl;
      }
    };
    const handleNavigate = (event: Event) => {
      const navigatedUrl = (event as Event & { url?: string }).url;
      if (navigatedUrl?.startsWith("http://") || navigatedUrl?.startsWith("https://")) {
        writeDedicatedPageLastUrl(props.environmentId, props.projectId, props.kind, navigatedUrl);
      }
    };
    webview.addEventListener("new-window", handleNewWindow);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    return () => {
      webview.removeEventListener("new-window", handleNewWindow);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, [config?.url, previewConfig, props.environmentId, props.kind, props.projectId]);

  const openExternal = () => {
    if (!config) return;
    const api = readLocalApi();
    void api?.shell.openExternal(config.url);
  };

  const save = () => {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("URL harus menggunakan http atau https.");
        return;
      }
      writeDedicatedPageLastUrl(
        props.environmentId,
        props.projectId,
        props.kind,
        parsed.toString(),
      );
      setConfig({ url: parsed.toString(), icon });
      setError(null);
      setDialogOpen(false);
    } catch {
      setError("Masukkan URL yang valid.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span
            className={`flex size-6 shrink-0 items-center justify-center overflow-hidden rounded text-xs ${copy.fallbackClass}`}
          >
            {config?.icon === "favicon" && favicon ? (
              <img src={favicon} alt="" className="size-4" />
            ) : (
              copy.fallback
            )}
          </span>
          <span className="truncate">{copy.name}</span>
          {config ? (
            <span className="truncate text-xs text-muted-foreground">{hostnameOf(config.url)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {config ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Open ${copy.name} externally`}
              onClick={openExternal}
            >
              <ExternalLink className="size-4" />
            </Button>
          ) : null}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Configure ${copy.name}`}
            onClick={() => {
              setUrl(config?.url ?? "");
              setIcon(config?.icon ?? "favicon");
              setDialogOpen(true);
            }}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </header>
      {config ? (
        pageContent
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Globe2 className="size-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Connect {copy.name}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{copy.description}</p>
          <Button onClick={() => setDialogOpen(true)}>
            <Pencil className="size-4" />
            Add page URL
          </Button>
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Set up {copy.name}</DialogTitle>
            <DialogDescription>
              This page is saved separately for the current workspace and project.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`${props.kind}-url`}>
                Page URL
              </label>
              <Input
                id={`${props.kind}-url`}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={`https://${props.kind}.com/...`}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Icon</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={icon === "favicon" ? "default" : "outline"}
                  onClick={() => setIcon("favicon")}
                  disabled={!faviconUrlForOrigin(url)}
                >
                  <Globe2 className="size-4" />
                  Use website icon
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={icon === "default" ? "default" : "outline"}
                  onClick={() => setIcon("default")}
                >
                  <span
                    className={`flex size-4 items-center justify-center rounded text-[10px] ${copy.fallbackClass}`}
                  >
                    {copy.fallback}
                  </span>
                  Default icon
                </Button>
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </DialogPanel>
          <DialogFooter>
            {config ? (
              <Button
                type="button"
                variant="destructive"
                className="me-auto"
                onClick={() => {
                  removeLocalStorageItem(
                    dedicatedPageLastUrlKey(props.environmentId, props.projectId, props.kind),
                  );
                  setConfig(null);
                  setDialogOpen(false);
                }}
              >
                <Trash2 className="size-4" />
                Remove page
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="size-4" />
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              <Save className="size-4" />
              Save page
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
