import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { DedicatedPagePanel, type DedicatedPageTemplate } from "../dedicated/DedicatedPagePanel";

export function ClickUpPagePanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly initialTemplate?: DedicatedPageTemplate;
}) {
  return <DedicatedPagePanel kind="clickup" {...props} />;
}
