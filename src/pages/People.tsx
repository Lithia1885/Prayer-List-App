import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Masthead } from "@/components/Masthead";
import { StatusBadge } from "@/components/StatusBadge";
import { safeFormat, safeTime } from "@/lib/dates";
import { usePrayerStore } from "@/lib/prayer-store";
import type { PrayerRequest, PrayerStatus } from "@/lib/prayer-types";

interface Person {
  // Stable group id. For linked records this is `personId`; for unlinked
  // singletons we use the record's own id, prefixed so it can't collide.
  key: string;
  displayName: string;
  records: PrayerRequest[];
  // True if this is a real linked group (vs. a one-off ungrouped record).
  isLinked: boolean;
}

const STATUS_ORDER: Record<PrayerStatus, number> = {
  Active: 0,
  Ongoing: 1,
  Resolved: 2,
  Archived: 3,
};

// Group records by personId. Records without a personId are returned as
// singletons so the roster shows everyone, not only those who've been linked.
function groupByPerson(items: PrayerRequest[]): Person[] {
  const linked = new Map<number, PrayerRequest[]>();
  const singletons: PrayerRequest[] = [];

  for (const item of items) {
    if (item.personId === undefined) {
      singletons.push(item);
      continue;
    }
    const bucket = linked.get(item.personId) ?? [];
    bucket.push(item);
    linked.set(item.personId, bucket);
  }

  const linkedPeople: Person[] = Array.from(linked.entries()).map(([pid, records]) => {
    // Sort records: liveness first (Active/Ongoing before Resolved/Archived),
    // then most recently submitted within each tier.
    const sorted = [...records].sort((a, b) => {
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s !== 0) return s;
      return safeTime(b.dateSubmitted) - safeTime(a.dateSubmitted);
    });
    // Display name: the primary record's title if it's still in the group;
    // otherwise the most recent record's title.
    const primary = sorted.find((r) => r.id === pid) ?? sorted[0];
    return {
      key: `p:${pid}`,
      displayName: primary.title,
      records: sorted,
      isLinked: true,
    };
  });

  const singletonPeople: Person[] = singletons.map((r) => ({
    key: `s:${r.id}`,
    displayName: r.title,
    records: [r],
    isLinked: false,
  }));

  return [...linkedPeople, ...singletonPeople];
}

type Filter = "All" | "Linked" | "Active";

const People = () => {
  const items = usePrayerStore((s) => s.items);
  const loaded = usePrayerStore((s) => s.loaded);
  const loading = usePrayerStore((s) => s.loading);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const people = useMemo(() => groupByPerson(items), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => {
        if (filter === "Linked" && !p.isLinked) return false;
        if (filter === "Active") {
          const hasLive = p.records.some(
            (r) => r.status === "Active" || r.status === "Ongoing"
          );
          if (!hasLive) return false;
        }
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.records.some(
            (r) =>
              r.title.toLowerCase().includes(q) ||
              (r.relationship?.toLowerCase().includes(q) ?? false) ||
              r.request.toLowerCase().includes(q)
          )
        );
      })
      .sort((a, b) => {
        // Linked groups first, then alphabetical by display name.
        if (a.isLinked !== b.isLinked) return a.isLinked ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [people, query, filter]);

  const linkedCount = useMemo(() => people.filter((p) => p.isLinked).length, [people]);

  return (
    <div className="min-h-screen pb-12">
      <Masthead />

      <section className="container-wide pt-6 pb-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="font-display text-3xl sm:text-4xl">People</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{linkedCount}</span>{" "}
            {linkedCount === 1 ? "linked group" : "linked groups"} ·{" "}
            <span className="font-semibold text-foreground">{people.length}</span> total
          </p>
        </div>
        <p className="text-base text-muted-foreground mt-2">
          Records linked together as the same person. Link new records from the detail page.
        </p>
      </section>

      <section className="container-wide pb-4">
        <div className="border-y border-separator py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, relationship, or request"
            aria-label="Search people"
            autoCorrect="off"
            autoCapitalize="off"
            className="field"
          />
          <label className="block">
            <span className="sr-only">Show</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="field"
            >
              <option value="All">Everyone</option>
              <option value="Linked">Linked groups only</option>
              <option value="Active">With active or ongoing records</option>
            </select>
          </label>
        </div>
      </section>

      <main className="container-wide">
        {!loaded && loading ? (
          <p className="text-center text-muted-foreground py-16 text-lg">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-16 text-lg">
            No people match your search.
          </p>
        ) : (
          <ul className="divide-y divide-separator">
            {visible.map((person) => (
              <li key={person.key} className="py-5 sm:py-6">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h2 className="font-display text-2xl sm:text-3xl leading-tight">
                    {person.displayName}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {person.records.length}{" "}
                    {person.records.length === 1 ? "record" : "records"}
                    {!person.isLinked && (
                      <span className="ml-2 text-muted-foreground/70">(unlinked)</span>
                    )}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {person.records.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/request/${r.id}`}
                        className="group flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-surface-sunken/60 active:bg-surface-sunken transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusBadge status={r.status} />
                            <span className="meta-caps">{r.category}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">
                              Submitted {safeFormat(r.dateSubmitted, "MMM d, yyyy")}
                            </span>
                          </div>
                          {r.relationship && (
                            <p className="text-sm text-muted-foreground mt-1">{r.relationship}</p>
                          )}
                          <p className="text-foreground/85 leading-snug line-clamp-1 text-base mt-1">
                            {r.request}
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className="text-xl text-muted-foreground/60 group-hover:text-primary leading-none mt-1.5 select-none"
                        >
                          ›
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default People;
