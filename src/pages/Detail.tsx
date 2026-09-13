import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LinkPersonDialog } from "@/components/LinkPersonDialog";
import { Masthead } from "@/components/Masthead";
import { MergeDialog } from "@/components/MergeDialog";
import { safeFormat, safeTime } from "@/lib/dates";
import { splitEventsForDisplay } from "@/lib/events";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { isAdminUpn } from "@/lib/msal";
import { usePrayerStore } from "@/lib/prayer-store";
import { toast } from "sonner";

const Detail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = usePrayerStore((s) => s.items.find((i) => i.id === Number(id)));
  // Subscribe to the raw events array — `.filter()` inside a selector returns a
  // new reference every render, which Zustand reads as a state change and loops
  // (React error #185).
  const allEvents = usePrayerStore((s) => s.events);
  const allItems = usePrayerStore((s) => s.items);
  const loaded = usePrayerStore((s) => s.loaded);
  const loading = usePrayerStore((s) => s.loading);
  const currentUpn = usePrayerStore((s) => s.currentUpn);
  const setStatus = usePrayerStore((s) => s.setStatus);
  const remove = usePrayerStore((s) => s.remove);
  const addNote = usePrayerStore((s) => s.addNote);
  const unlinkFromPerson = usePrayerStore((s) => s.unlinkFromPerson);

  const isAdmin = isAdminUpn(currentUpn);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const sortedEvents = useMemo(() => {
    if (!item) return [];
    return allEvents
      .filter((e) => e.requestId === item.id)
      .sort((a, b) => safeTime(b.at) - safeTime(a.at));
  }, [allEvents, item]);

  // Split events into pastoral story vs admin/merge maintenance. Default
  // Timeline shows just the pastoral side; admin can flip on full history.
  const { pastoral: pastoralEvents, maintenance: maintenanceEvents } = useMemo(
    () => splitEventsForDisplay(sortedEvents),
    [sortedEvents]
  );
  const visibleEvents = showFullHistory ? sortedEvents : pastoralEvents;

  // When was the body of "Current request" last actually set, and by whom?
  // Both `addNote` (a Post update) and `update()` with a body change stash the
  // new text in their event's `note`, so an exact-text match against either
  // kind tells us when the live body was last set. Merge-promoted note events
  // carry a "From merged record …:" prefix that won't match the body, so
  // they're correctly excluded. If nothing matches, the body comes from the
  // original submission — fall back to the `created` event or
  // dateSubmitted/author. Hook must run on every render — `item` may be
  // undefined while loading.
  const bodyProvenance = useMemo(() => {
    if (!item) return null;
    const liveBody = (item.request ?? "").trim();
    if (liveBody) {
      const lastSet = sortedEvents.find(
        (e) =>
          (e.kind === "note" || e.kind === "edited") &&
          (e.note ?? "").trim() === liveBody
      );
      if (lastSet) return { at: lastSet.at, by: lastSet.by, kind: "updated" as const };
    }
    const created = sortedEvents.find((e) => e.kind === "created");
    if (created) return { at: created.at, by: created.by, kind: "original" as const };
    return { at: item.dateSubmitted, by: item.author, kind: "original" as const };
  }, [item, sortedEvents]);

  if (!item) {
    const stillLoading = !loaded && loading;
    return (
      <div className="min-h-screen">
        <Masthead />
        <div className="container-prose py-24 text-center">
          <p className="font-display text-3xl">
            {stillLoading ? "Loading the list…" : "This request could not be found."}
          </p>
          {!stillLoading && (
            <Link to="/" className="text-primary mt-4 inline-block text-lg">
              ← Return to the list
            </Link>
          )}
        </div>
      </div>
    );
  }

  const isInactive = item.status === "Resolved" || item.status === "Archived";
  const backTo = isInactive ? "/archive" : "/";

  // Other records linked to this person (excluding this one).
  const personSiblings = item.personId
    ? allItems.filter((i) => i.id !== item.id && i.personId === item.personId)
    : [];

  const onUnlink = async () => {
    try {
      await unlinkFromPerson(item.id);
      toast.success("Unlinked from person.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not unlink.");
    }
  };

  const onAddNote = async () => {
    if (!noteDraft.trim()) return;
    try {
      await addNote(item.id, noteDraft);
      setNoteDraft("");
      toast.success("Update posted.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save update.");
    }
  };

  const doStatus = async (next: typeof item.status, msg: string, after?: () => void) => {
    try {
      await setStatus(item.id, next);
      toast.success(msg);
      after?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update status.");
    }
  };

  return (
    <div className="min-h-screen">
      <Masthead />

      <article className="container-prose py-6 sm:py-10">
        <Link
          to={backTo}
          className="text-base text-foreground/80 hover:text-primary inline-flex items-center gap-2 min-h-[44px]"
        >
          <span aria-hidden className="text-xl">←</span> Back to the list
        </Link>

        <header className="mt-4 pb-6 border-b border-separator">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
            <StatusBadge status={item.status} />
            <span className="meta-caps">{item.category}</span>
          </div>
          <h1 className="font-display">{item.title}</h1>
          {item.relationship && (
            <p className="text-muted-foreground mt-2 text-lg">{item.relationship}</p>
          )}
          <p className="text-sm text-muted-foreground mt-3 tabular-nums">
            Submitted {safeFormat(item.dateSubmitted, "MMMM d, yyyy", "an unknown date")}
            <span className="hidden sm:inline"> · by {item.author}</span>
            <span className="sm:hidden block">by {item.author}</span>
          </p>
          {personSiblings.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Linked with {personSiblings.length}{" "}
              {personSiblings.length === 1 ? "other record" : "other records"} for this person.{" "}
              <Link to="/people" className="text-primary hover:underline underline-offset-4">
                See all on the People roster
              </Link>
            </p>
          )}
        </header>

        <section className="mt-6">
          <h2 className="eyebrow mb-2">Current request</h2>
          <p className="text-lg sm:text-xl leading-[1.6] text-foreground">
            {item.request}
          </p>
          {bodyProvenance && (
            <p className="text-sm text-muted-foreground mt-2">
              {bodyProvenance.kind === "updated" ? "Last updated" : "From the original request"}{" "}
              {safeFormat(bodyProvenance.at, "MMM d, yyyy", "an unknown date")} by{" "}
              {bodyProvenance.by}
            </p>
          )}
        </section>

        {/* Post an update — replaces the body above and gets read aloud Wednesday.
            Lives right under the body so the visual relationship is unmissable. */}
        {(item.status === "Active" || item.status === "Ongoing") && (
          <section className="panel mt-5 p-4 sm:p-5">
            <label className="block">
              <span className="eyebrow block mb-2">Post an update</span>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="What's the update?"
                className="field-textarea p-3"
              />
              <span className="block text-sm text-muted-foreground mt-1.5">
                Replaces the current request and goes in the next bulletin.
              </span>
            </label>
            <div className="mt-3 flex justify-end">
              <button
                onClick={onAddNote}
                disabled={!noteDraft.trim()}
                className="btn-primary"
              >
                Post update
              </button>
            </div>
          </section>
        )}

        {item.notes && (
          <section className="panel mt-8 p-4 sm:p-5">
            <h3 className="eyebrow mb-2">Pastoral notes</h3>
            <p className="text-foreground/90 leading-relaxed text-base sm:text-lg">{item.notes}</p>
          </section>
        )}

        {item.address && (
          <section className="mt-6">
            <h3 className="eyebrow mb-2">Address</h3>
            <p className="text-foreground/85 whitespace-pre-line text-base sm:text-lg">{item.address}</p>
          </section>
        )}

        <hr className="rule my-8" />

        {/* Actions — full width and stacked on phone, primary action obviously solid */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <Link to={`/request/${item.id}/edit`} className="btn-secondary w-full sm:w-auto">
            Edit details
          </Link>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setMergeOpen(true)}
              className="btn-secondary w-full sm:w-auto"
              title="Merge a duplicate record into this one"
            >
              Merge in duplicate
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setLinkOpen(true)}
              className="btn-secondary w-full sm:w-auto"
              title="Link to another record describing the same person"
            >
              Link as same person
            </button>
          )}

          {isAdmin && item.personId !== undefined && (
            <button
              type="button"
              onClick={onUnlink}
              className="btn-quiet w-full sm:w-auto"
              title="Remove this record from its person group"
            >
              Unlink from person
            </button>
          )}

          {item.status === "Active" && (
            <button
              onClick={() => doStatus("Ongoing", "Marked as ongoing.")}
              className="btn-secondary w-full sm:w-auto"
            >
              Mark ongoing
            </button>
          )}
          {item.status === "Ongoing" && (
            <button
              onClick={() => doStatus("Active", "Returned to active.")}
              className="btn-secondary w-full sm:w-auto"
            >
              Return to active
            </button>
          )}

          {(item.status === "Active" || item.status === "Ongoing") && (
            <>
              <button
                onClick={() => doStatus("Resolved", "Marked as resolved.")}
                className="btn-secondary w-full sm:w-auto"
              >
                ✓ Mark resolved
              </button>
              <button
                onClick={() => doStatus("Archived", "Moved to archive.", () => navigate("/archive"))}
                className="btn-secondary w-full sm:w-auto"
              >
                Archive
              </button>
            </>
          )}

          {isInactive && (
            <button
              onClick={() => doStatus("Active", "Restored to the active list.", () => navigate("/"))}
              className="btn-secondary w-full sm:w-auto"
            >
              Restore to list
            </button>
          )}

          <button
            onClick={() => setConfirmDelete(true)}
            className="btn-quiet w-full sm:w-auto sm:ml-auto text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
        </div>

        {/* Activity */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">Activity</h2>
            <span className="text-sm text-muted-foreground">
              {visibleEvents.length}{" "}
              {visibleEvents.length === 1 ? "entry" : "entries"}
              {!showFullHistory && maintenanceEvents.length > 0 && (
                <>
                  {" "}
                  <span className="text-muted-foreground/70">
                    ({maintenanceEvents.length} hidden)
                  </span>
                </>
              )}
            </span>
          </div>

          {isAdmin && maintenanceEvents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFullHistory((v) => !v)}
              className="text-sm text-primary hover:underline underline-offset-4 mb-4 inline-flex items-center gap-1"
            >
              {showFullHistory ? "Hide maintenance entries" : "Show full history"}
            </button>
          )}

          <Timeline events={visibleEvents} />
        </section>
      </article>

      {/* Merge dialog — admin-only, gated above by isAdmin on the trigger */}
      <MergeDialog
        canonical={item}
        isOpen={mergeOpen}
        onClose={() => setMergeOpen(false)}
      />

      {/* Link person dialog — admin-only, gated above by isAdmin on the trigger */}
      <LinkPersonDialog
        self={item}
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
      />

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="dialog-backdrop" onClick={() => setConfirmDelete(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="dialog max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-title" className="text-xl font-semibold">Remove this request?</h3>
            <p className="mt-3 text-foreground/85">
              This permanently deletes the entry and its history.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary w-full sm:w-auto">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await remove(item.id);
                    toast.success("Request removed.");
                    navigate("/");
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : "Delete failed.");
                  }
                }}
                className="btn-danger w-full sm:w-auto"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Detail;
