import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useQuery } from "@tanstack/react-query";
import { acknowledgeNotice, fetchNoticeState } from "@/lib/graph";
import {
  NOTICE_ACKNOWLEDGE,
  NOTICE_BODY,
  NOTICE_COLLAPSED,
  NOTICE_HEADING,
  NOTICE_ID,
} from "@/lib/notice";

/**
 * The standing notice, in the page's flow above everything else so it pushes
 * the list down rather than covering it, and stays until it is read. Not a
 * toast: it has to survive being ignored for a week.
 *
 * Whether it has been read lives in SharePoint, not in this browser, so it
 * follows a person from their phone to the office computer.
 */
export const NoticeBanner = () => {
  const { accounts } = useMsal();
  // The Entra object id, not the sign-in name: it is the account's permanent
  // identifier, and it is what each row's author is matched against.
  const accountId = accounts[0]?.localAccountId;

  const { data: state } = useQuery({
    queryKey: ["notice", NOTICE_ID, accountId],
    queryFn: () => fetchNoticeState(NOTICE_ID, accountId as string),
    enabled: !!accountId,
    staleTime: Infinity,
    retry: false,
  });

  // Set when this person presses OK, so the banner collapses immediately
  // rather than waiting on the write.
  const [acknowledgedHere, setAcknowledgedHere] = useState(false);
  const [reopened, setReopened] = useState(false);

  // No list on the site, or it couldn't be read: show nothing rather than a
  // banner nobody can dismiss.
  if (!state || state === "unavailable") return null;

  const acknowledged = acknowledgedHere || state === "acknowledged";

  const onAcknowledge = () => {
    if (reopened) {
      setReopened(false);
      return;
    }
    setAcknowledgedHere(true);
    acknowledgeNotice(NOTICE_ID).catch((e) => {
      // Nothing to say to the reader — they have read it either way. It just
      // means the receipt didn't save, so the notice returns on next load.
      console.warn("[notice] could not record the acknowledgement:", e);
    });
  };

  if (acknowledged && !reopened) {
    return (
      <button
        type="button"
        onClick={() => setReopened(true)}
        className="block w-full bg-accent-surface border-b border-accent-border px-5 sm:px-6 py-3 text-left text-base text-brand hover:bg-accent-surface/70 transition-colors"
      >
        {NOTICE_COLLAPSED}
      </button>
    );
  }

  return (
    <section
      aria-labelledby="notice-heading"
      className="bg-accent-surface border-b border-accent-border"
    >
      <div className="container-wide py-6 sm:py-8">
        <h2 id="notice-heading" className="font-display text-2xl sm:text-3xl text-brand">
          {NOTICE_HEADING}
        </h2>
        {/* pre-line: the line breaks in the copy are the author's. */}
        <p className="mt-4 whitespace-pre-line text-base sm:text-lg leading-relaxed text-foreground">
          {NOTICE_BODY}
        </p>
        <button type="button" onClick={onAcknowledge} className="btn-primary mt-6 w-full sm:w-auto">
          {NOTICE_ACKNOWLEDGE}
        </button>
      </div>
    </section>
  );
};
