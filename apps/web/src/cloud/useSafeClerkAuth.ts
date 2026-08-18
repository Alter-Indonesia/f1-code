import { useAuth } from "@clerk/react";

/**
 * `@clerk/react`'s `useAuth()` throws synchronously ("useAuth can only be
 * used within the <ClerkProvider />") the moment it's called without a
 * `<ClerkProvider>` ancestor — before touching any of its own internal
 * hooks. Self-host deployments that configure Alter OIDC instead of Clerk
 * (see `main.tsx`'s conditional `ClerkProvider` mount) never mount that
 * provider, but several components (`managedAuth.tsx`,
 * `T3ConnectSidebarSignIn.tsx`, `useCloudLinkController.ts`) call
 * `useAuth()` unconditionally regardless — they were built to run
 * alongside Alter OIDC support, not gated on Clerk specifically existing.
 *
 * Wrapping the call in try/catch is safe here specifically because
 * whether `<ClerkProvider>` is mounted is fixed for the lifetime of a
 * given component instance (decided once in `main.tsx` at app boot), so
 * this doesn't violate the rules-of-hooks assumption that a component
 * calls the same hooks in the same order every render.
 */
export function useSafeClerkAuth(...args: Parameters<typeof useAuth>): ReturnType<typeof useAuth> {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth(...args);
  } catch {
    return {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      actor: null,
      orgId: null,
      orgRole: null,
      orgSlug: null,
      orgPermissions: null,
      has: () => false,
      signOut: async () => {},
      getToken: async () => null,
    } as unknown as ReturnType<typeof useAuth>;
  }
}
