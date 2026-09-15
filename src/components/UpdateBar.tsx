import { useEffect, useState } from "react";
import { reloadToCurrentBuild, subscribeToUpdates } from "@/lib/sw-update";

/**
 * A persistent offer, not a toast. A notice that fades after four seconds is
 * how someone spends a month on last month's build, so this stays until it is
 * acted on or dismissed.
 *
 * Sits at the top rather than the bottom: the bottom-right corner is the
 * mobile "New request" button, and covering that to announce an update would
 * block the app's main action.
 */
export const UpdateBar = () => {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(
    () =>
      subscribeToUpdates((next) => {
        setReady(next);
        // A later update re-offers itself even if the last one was dismissed.
        if (next) setDismissed(false);
      }),
    []
  );

  if (!ready || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-brand text-brand-foreground shadow-lg"
    >
      <div className="container-wide flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-base">A newer version of the Prayer List is ready.</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={reloadToCurrentBuild}
            className="inline-flex items-center justify-center rounded-lg bg-brand-foreground px-4 py-2 min-h-[44px] text-base font-semibold text-brand transition-opacity hover:opacity-90"
          >
            Reload now
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            title="The update applies on its own the next time the app is fully closed and reopened."
            className="inline-flex items-center justify-center rounded-lg px-4 py-2 min-h-[44px] text-base text-brand-foreground/90 transition-colors hover:bg-white/10"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
