import { useClerk } from "@clerk/react";

import { isElectron } from "../../env";
import { buildAlterLoginUrl } from "../../cloud/alterSession";
import { resolveClerkSignInProps } from "./authRedirect";

// `useClerk()` throws synchronously without a `<ClerkProvider>` ancestor —
// see useSafeClerkAuth.ts for why try/catch is safe here (whether Clerk is
// configured is fixed for the component's lifetime, not conditional per
// render).
function useSafeClerk(): ReturnType<typeof useClerk> | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useClerk();
  } catch {
    return null;
  }
}

export function useT3ConnectAuthPrompt() {
  const clerk = useSafeClerk();
  const openAuthPrompt = () => {
    if (clerk) {
      clerk.openSignIn(resolveClerkSignInProps(window.location.href, isElectron));
      return;
    }
    const url = buildAlterLoginUrl();
    if (url) window.location.assign(url);
  };
  return { authPrompt: null, openAuthPrompt };
}
