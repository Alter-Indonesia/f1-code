import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { completeAlterLogin, type AlterLoginCompletionError } from "../../cloud/alterSession";
import { AuthSurfaceShell } from "../auth/AuthSurfaceShell";
import { Button } from "../ui/button";

const ERROR_MESSAGES: Record<AlterLoginCompletionError, string> = {
  missing_params: "The sign-in link is missing its authorization code.",
  invalid_state: "This sign-in link doesn't match the one that was started in this browser.",
  not_configured: "This F1 Code deployment isn't configured for Alter One sign-in.",
  exchange_failed: "F1 Code couldn't complete sign-in with Alter One. Please try again.",
};

/**
 * `/oauth/callback`: where Alter One SSO redirects back to after login.
 * Exchanges the authorization code for a session through the relay (see
 * `completeAlterLogin`), then returns to the app.
 */
export function AlterOidcCallbackSurface() {
  const navigate = useNavigate();
  const [error, setError] = useState<AlterLoginCompletionError | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    let cancelled = false;
    void completeAlterLogin(code, state).then((result) => {
      if (cancelled) return;
      if (result) {
        setError(result);
        return;
      }
      void navigate({ to: "/", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <AuthSurfaceShell>
      {error ? (
        <>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Sign-in didn't complete
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {ERROR_MESSAGES[error]}
          </p>
          <div className="mt-6">
            <Button type="button" onClick={() => void navigate({ to: "/", replace: true })}>
              Back to F1 Code
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Signing you in</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Finishing sign-in with Alter One…
          </p>
        </>
      )}
    </AuthSurfaceShell>
  );
}
