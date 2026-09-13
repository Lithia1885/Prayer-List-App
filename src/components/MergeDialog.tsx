import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { usePrayerStore } from "@/lib/prayer-store";
import type { PrayerRequest } from "@/lib/prayer-types";

interface Props {
  canonical: PrayerRequest;
  isOpen: boolean;
  onClose: () => void;
}

export const MergeDialog = ({ canonical, isOpen, onClose }: Props) => {
  const allItems = usePrayerStore((s) => s.items);
  const allEvents = usePrayerStore((s) => s.events);
  const mergeInto = usePrayerStore((s) => s.mergeInto);

  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<PrayerRequest | null>(null);
  const [merging, setMerging] = useState(false);
  // Hide archived/resolved records from candidates by default — accidentally
  // merging into a years-old archived row is destructive and rarely intended.
  const [includeArchive, setIncludeArchive] = useState(false);

  // Default the search to the canonical's title each time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setQuery(canonical.title);
      setConfirming(null);
      setIncludeArchive(false);
    }
  }, [isOpen, canonical.title]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return allItems
      .filter((i) => i.id !== canonical.id)
      .filter((i) => includeArchive || (i.status !== "Archived" && i.status !== "Resolved"))
      .filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.relationship?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 10);
  }, [allItems, query, canonical, includeArchive]);

  // How many additional matches are hidden behind the archive filter — surface
  // the count so the admin knows the toggle would reveal more.
  const hiddenArchiveCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || includeArchive) return 0;
    return allItems
      .filter((i) => i.id !== canonical.id)
      .filter((i) => i.status === "Archived" || i.status === "Resolved")
      .filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.relationship?.toLowerCase().includes(q) ?? false)
      ).length;
  }, [allItems, query, canonical, includeArchive]);

  const eventCountFor = (id: number) =>
    allEvents.filter((e) => e.requestId === id).length;

  const onConfirmMerge = async () => {
    if (!confirming) return;
    setMerging(true);
    try {
      await mergeInto(canonical.id, confirming.id);
      toast.success(`Merged "${confirming.title}" into this record.`);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Merge failed.");
    } finally {
      setMerging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-title"
        className="dialog max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!confirming ? (
          <>
            <h3 id="merge-title" className="text-xl font-semibold">
              Merge another request into this one
            </h3>
            <p className="text-base text-muted-foreground mt-2">
              Pick the duplicate to merge in. Its activity will be moved here, then it'll be deleted.
              The current record's text and category stay as they are.
            </p>

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              aria-label="Search by name"
              autoCorrect="off"
              autoCapitalize="off"
              className="field mt-5"
            />

            <label className="inline-flex items-center gap-2 mt-3 text-sm text-foreground/80 cursor-pointer">
              <input
                type="checkbox"
                checked={includeArchive}
                onChange={(e) => setIncludeArchive(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Include archived and resolved
              {hiddenArchiveCount > 0 && (
                <span className="text-muted-foreground">
                  ({hiddenArchiveCount} hidden)
                </span>
              )}
            </label>

            <div className="mt-4">
              {query.trim().length < 2 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Type a name to search.
                </p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No other records match.
                </p>
              ) : (
                <ul className="divide-y divide-separator border-y border-separator">
                  {candidates.map((c) => {
                    const count = eventCountFor(c.id);
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-display text-lg sm:text-xl">{c.title}</span>
                            <StatusBadge status={c.status} />
                            <span className="meta-caps">{c.category}</span>
                          </div>
                          {c.relationship && (
                            <p className="text-sm text-muted-foreground mt-0.5">{c.relationship}</p>
                          )}
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {count} {count === 1 ? "entry" : "entries"} of activity
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirming(c)}
                          className="btn-secondary text-sm whitespace-nowrap"
                        >
                          Merge in
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button type="button" onClick={onClose} className="btn-quiet">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="merge-title" className="text-xl font-semibold">Confirm merge</h3>
            <p className="mt-3 text-foreground/90 text-base sm:text-lg leading-relaxed">
              This will move{" "}
              <strong>{eventCountFor(confirming.id)}</strong>{" "}
              {eventCountFor(confirming.id) === 1 ? "entry" : "entries"} of activity from{" "}
              <strong>"{confirming.title}"</strong> into <strong>"{canonical.title}"</strong>,
              then delete <strong>"{confirming.title}"</strong>.
            </p>
            {confirming.request &&
              confirming.request.trim() !== (canonical.request ?? "").trim() && (
                <p className="mt-3 text-foreground/90 text-base leading-relaxed">
                  The duplicate's prayer text will be added to <strong>"{canonical.title}"</strong>{" "}
                  as a Post update so the wording stays in the timeline.
                </p>
              )}
            {confirming.dateSubmitted &&
              canonical.dateSubmitted &&
              confirming.dateSubmitted < canonical.dateSubmitted && (
                <p className="mt-3 text-sm text-muted-foreground">
                  "On the list since" will inherit the earlier date ({confirming.dateSubmitted}).
                </p>
              )}

            {(confirming.request ||
              confirming.relationship ||
              confirming.address ||
              confirming.notes) && (
              <div className="mt-4 rounded-lg border border-hairline bg-surface-sunken p-4">
                <p className="eyebrow mb-2">Content on "{confirming.title}"</p>
                {confirming.request && (
                  <p className="text-base sm:text-lg leading-relaxed text-foreground/90">
                    {confirming.request}
                  </p>
                )}
                {confirming.relationship && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Relationship: {confirming.relationship}
                  </p>
                )}
                {confirming.address && (
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">
                    Address: {confirming.address}
                  </p>
                )}
                {confirming.notes && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pastoral notes: {confirming.notes}
                  </p>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  The prayer text above is automatically added to "{canonical.title}" as a Post
                  update. Relationship, address, and pastoral notes are preserved in the merge
                  audit entry. The canonical record's own prayer text is <strong>not</strong>{" "}
                  replaced.
                </p>
              </div>
            )}

            <p className="mt-4 text-sm text-destructive font-semibold">
              This cannot be undone.
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={merging}
                className="btn-secondary w-full sm:w-auto"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onConfirmMerge}
                disabled={merging}
                className="btn-danger w-full sm:w-auto"
              >
                {merging ? "Merging…" : "Yes, merge"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
