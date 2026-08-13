import { useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { BuildTag } from "@/components/BuildTag";
import { GRAPH_SCOPES, msalInstance } from "@/lib/msal";

interface Props {
  children: React.ReactNode;
}

/**
 * Renders children only when an MSAL account is present. Otherwise shows a
 * centered sign-in panel matching the masthead's editorial styling.
 */
export const AuthGate = ({ children }: Props) => {
  const { inProgress } = useMsal();
  const isAuthed = useIsAuthenticated();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  if (isAuthed) return <>{children}</>;

  const onSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      const res = await msalInstance.loginPopup({
        scopes: GRAPH_SCOPES,
        prompt: "select_account",
      });
      if (res.account) {
        msalInstance.setActiveAccount(res.account);
      }
      // useIsAuthenticated reacts to the LOGIN_SUCCESS event; nothing else
      // to do here. Keep the spinner on until React re-renders us out.
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      setError(msg);
      setSigningIn(false);
    }
  };

  const busy = signingIn || inProgress !== "none";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="eyebrow">Lithia Springs Methodist</p>
        <h1 className="font-display mt-3 text-4xl">The Prayer List</h1>
        <p className="text-muted-foreground mt-6 text-base sm:text-lg leading-relaxed">
          Sign in with your church Microsoft 365 account to read and update the list.
        </p>

        <button
          onClick={onSignIn}
          disabled={busy}
          className="btn-primary mt-8 w-full disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in with Microsoft"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-destructive break-words">{error}</p>
        )}

        {/* Visible pre-sign-in on purpose: a stale installed PWA is easiest
            to diagnose from the very first screen it shows. */}
        <BuildTag />
      </div>
    </div>
  );
};
