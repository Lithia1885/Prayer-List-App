import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Masthead } from "@/components/Masthead";
import { StatusBadge } from "@/components/StatusBadge";
import { usePrayerStore } from "@/lib/prayer-store";
import { CATEGORIES, STATUSES, type PrayerCategory, type PrayerStatus } from "@/lib/prayer-types";
import { toast } from "sonner";

const Edit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const items = usePrayerStore((s) => s.items);
  const loaded = usePrayerStore((s) => s.loaded);
  const loading = usePrayerStore((s) => s.loading);
  const add = usePrayerStore((s) => s.add);
  const update = usePrayerStore((s) => s.update);

  const existing = id ? items.find((i) => i.id === Number(id)) : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [request, setRequest] = useState(existing?.request ?? "");
  const [category, setCategory] = useState<PrayerCategory>(existing?.category ?? "Member");
  const [status, setStatus] = useState<PrayerStatus>(existing?.status ?? "Active");
  const [relationship, setRelationship] = useState(existing?.relationship ?? "");
  const [dateSubmitted, setDateSubmitted] = useState(
    existing?.dateSubmitted ?? new Date().toISOString().slice(0, 10)
  );
  const [address, setAddress] = useState(existing?.address ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [saving, setSaving] = useState(false);
  // Quiet-save: typo fixes and small wording cleanups don't deserve to push
  // the record to the top of "Recently updated" or change its provenance line.
  // Off by default — most edits really are substantive updates.
  const [quietSave, setQuietSave] = useState(false);

  // Live duplicate-detection on the title field for new requests — surfaces
  // existing entries with similar titles so scribes don't re-create someone
  // who's already on the list. The "I have new info, must add new entry"
  // mental model from paper-based prayer lists is the most common adoption
  // mistake; nudging at the moment of creation is the cheapest fix.
  const possibleMatches = useMemo(() => {
    if (!isNew) return [];
    const q = title.trim().toLowerCase();
    if (q.length < 3) return [];
    return items
      .filter((i) => i.title.toLowerCase().includes(q))
      .slice(0, 3);
  }, [isNew, title, items]);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setRequest(existing.request);
    setCategory(existing.category);
    setStatus(existing.status);
    setRelationship(existing.relationship ?? "");
    setDateSubmitted(existing.dateSubmitted);
    setAddress(existing.address ?? "");
    setNotes(existing.notes ?? "");
  }, [existing]);

  if (id && !existing) {
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

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !request.trim()) {
      toast.error("Please give the request a name and a description.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await add({ title, request, category, status, relationship, dateSubmitted, address, notes });
        toast.success("Request added to the list.");
        navigate(`/request/${created.id}`);
      } else if (existing) {
        await update(
          existing.id,
          { title, request, category, status, relationship, dateSubmitted, address, notes },
          { quiet: quietSave }
        );
        toast.success(quietSave ? "Saved quietly." : "Request updated.");
        navigate(`/request/${existing.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Masthead />

      <form onSubmit={onSave} className="container-prose py-6 sm:py-10">
        <Link
          to={existing ? `/request/${existing.id}` : "/"}
          className="text-base text-foreground/80 hover:text-primary inline-flex items-center gap-2 min-h-[44px]"
        >
          <span aria-hidden className="text-xl">←</span> {existing ? "Cancel and return" : "Cancel"}
        </Link>

        <header className="mt-4 pb-4 border-b border-separator">
          <p className="eyebrow">{isNew ? "New entry" : "Editing"}</p>
          <h1 className="font-display mt-2">{isNew ? "New prayer request" : title || "Edit request"}</h1>
        </header>

        <div className="mt-8 space-y-7">
          <Field label="For whom or what *" hint="The person, family, or situation you're praying for.">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field text-xl"
            />
          </Field>

          {possibleMatches.length > 0 && (
            <div className="rounded-lg border border-accent-border bg-accent-surface p-4 -mt-4">
              <p className="eyebrow mb-2">Already on the list?</p>
              <ul className="divide-y divide-accent-border/70">
                {possibleMatches.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/request/${m.id}`}
                      className="flex items-center gap-3 py-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-display text-lg sm:text-xl group-hover:text-primary transition-colors">
                            {m.title}
                          </span>
                          <StatusBadge status={m.status} />
                          <span className="meta-caps">{m.category}</span>
                        </div>
                        {m.relationship && (
                          <p className="text-sm text-muted-foreground mt-0.5">{m.relationship}</p>
                        )}
                      </div>
                      <span className="text-sm text-primary whitespace-nowrap group-hover:underline underline-offset-4">
                        Update that one →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                If this is a different person, just keep typing.
              </p>
            </div>
          )}

          <Field label="The request *" hint="A few sentences the prayer team can read aloud.">
            <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={6} className="field-textarea" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PrayerCategory)}
                className="field"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as PrayerStatus)} className="field">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Relationship" hint="Optional.">
              <input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="field"
              />
            </Field>
            <Field label="Date submitted">
              <input
                type="date"
                value={dateSubmitted}
                onChange={(e) => setDateSubmitted(e.target.value)}
                className="field"
              />
            </Field>
          </div>

          <Field label="Address" hint="Optional. For cards or visits.">
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="field-textarea" />
          </Field>

          <Field label="Pastoral notes" hint="Visible to leadership only.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="field-textarea"
            />
          </Field>
        </div>

        <hr className="rule my-10" />

        {!isNew && (
          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <input
              type="checkbox"
              checked={quietSave}
              onChange={(e) => setQuietSave(e.target.checked)}
              className="h-5 w-5 mt-0.5 flex-shrink-0 accent-primary"
            />
            <span className="text-base">
              <span className="font-semibold">Just a small fix</span>
              <span className="block text-sm text-muted-foreground mt-0.5">
                Typo or wording cleanup — don't surface this as recent activity.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-end">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary w-full sm:w-auto">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
            {saving ? "Saving…" : isNew ? "Add to the list" : quietSave ? "Save quietly" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="eyebrow block mb-2">{label}</span>
    {children}
    {hint && <span className="block text-sm text-muted-foreground mt-1.5">{hint}</span>}
  </label>
);

export default Edit;
