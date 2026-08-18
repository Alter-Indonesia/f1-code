import { createFileRoute } from "@tanstack/react-router";

import { AlterOidcCallbackSurface } from "../components/cloud/AlterOidcCallbackSurface";

export const Route = createFileRoute("/oauth/callback")({
  component: AlterOidcCallbackSurface,
});
