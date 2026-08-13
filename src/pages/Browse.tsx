import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BuildTag } from "@/components/BuildTag";
import { Masthead } from "@/components/Masthead";
import { safeDistance, safeFormat, safeTime, daysSince, shortAge, STALE_DAYS } from "@/lib/dates";
import { StatusBadge } from "@/components/StatusBadge";
import { usePrayerStore } from "@/lib/prayer-store";
import { fetchLatestBulletin } from "@/lib/graph";
import { CATEGORIES, type PrayerCategory } from "@/lib/prayer-types";

type SortMode = "Newest" | "RecentlyUpdated" | "LongestOnList" | "Oldest" | "NameAsc" | "NameDesc";
const SORT_VALUES: readonly SortMode[] = ["Newest", "RecentlyUpdated", "LongestOnList", "Oldest", "NameAsc", "NameDesc"];
const DEFAULT_SORT: SortMode = "RecentlyUpdated";

const inputClass =
  "w-full bg-card border border-foreground/25 focus:border-primary outline-none rounded-lg px-4 py-3 min-h-[48px] text-base";

// Pure free function — kept at module scope so the useMemo dependency array
// stays honest. (The exhaustive-deps lint flagged it as missing when it lived
// in the component body, even though it captures nothing.)
const matchesQuery = (
  i: { title: string; request: string; relationship?: string },
  q: string
) =>
  !q ||
  i.title.toLowerCase().includes(q) ||
  i.request.toLowerCase().includes(q) ||
  (i.relationship?.toLowerCase().includes(q) ?? false);

const Browse = () => {
  const items = usePrayerStore((s) => s.items);
  const loading = usePrayerStore((s) => s.loading);
  const loaded = usePrayerStore((s) => s.loaded);
  const error = usePrayerStore((s) => s.error);
  const load = usePrayerStore((s) => s.load);
  const queryClient = useQueryClient();

  const onRefresh = async () => {
    try {
      await Promise.all([
        load(),
        queryClient.invalidateQueries({ queryKey: ["latest-bulletin"] }),
      ]);
      toast.success("List refreshed from SharePoint.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    }
  };

  // Filter state lives in the URL so it survives navigation to Detail and back.
  // `replace: true` on writes keeps each keystroke from polluting back history.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const sortParam = searchParams.get("sort");
  const sort: SortMode = sortParam && (SORT_VALUES as readonly string[]).includes(sortParam)
    ? (sortParam as SortMode)
    : DEFAULT_SORT;
  const catParam = searchParams.get("cat");
  const categoryFilter: PrayerCategory | "All" =
    catParam && (CATEGORIES as readonly string[]).includes(catParam)
      ? (catParam as PrayerCategory)
      : "All";

  const updateParam = (key: string, value: string, isDefault: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (isDefault || !value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const setQuery = (v: string) => updateParam("q", v, false);
  const setSort = (v: SortMode) => updateParam("sort", v, v === DEFAULT_SORT);
  const setCategoryFilter = (v: PrayerCategory | "All") => updateParam("cat", v, v === "All");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Latest weekly bulletin PDF — cached for 5 minutes since the flow only runs
  // once a week. Hides silently if the folder is empty or unreachable.
  const { data: bulletin } = useQuery({
    queryKey: ["latest-bulletin"],
    queryFn: fetchLatestBulletin,
    staleTime: 5 * 60 * 1000,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const live = items.filter((i) => i.status === "Active" || i.status === "Ongoing");
    const matched = live.filter((i) => {
      const matchesCat = categoryFilter === "All" || i.category === categoryFilter;
      return matchesQuery(i, q) && matchesCat;
    });
    const sorted = [...matched].sort((a, b) => {
      switch (sort) {
        case "Newest": return safeTime(b.created) - safeTime(a.created);
        case "RecentlyUpdated": return safeTime(b.modified) - safeTime(a.modified);
        case "LongestOnList": return safeTime(a.dateSubmitted) - safeTime(b.dateSubmitted);
        case "Oldest": return safeTime(a.created) - safeTime(b.created);
        case "NameAsc": return a.title.localeCompare(b.title);
        case "NameDesc": return b.title.localeCompare(a.title);
      }
    });
    return sorted;
  }, [items, query, sort, categoryFilter]);

  // When the user has typed a query, also surface matches from the archive so
  // "did we ever pray for the Wheelers?" works without leaving Browse.
  const archiveMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((i) => i.status === "Resolved" || i.status === "Archived")
      .filter((i) => {
        const matchesCat = categoryFilter === "All" || i.category === categoryFilter;
        return matchesQuery(i, q) && matchesCat;
      })
      .sort((a, b) => safeTime(b.modified) - safeTime(a.modified));
  }, [items, query, categoryFilter]);

  const counts = useMemo(() => ({
    Active: items.filter((i) => i.status === "Active").length,
    Ongoing: items.filter((i) => i.status === "Ongoing").length,
  }), [items]);

  const staleCount = useMemo(
    () =>
      items.filter(
        (i) =>
          (i.status === "Active" || i.status === "Ongoing") &&
          daysSince(i.dateSubmitted) >= STALE_DAYS
      ).length,
    [items]
  );

  const filtersActive = categoryFilter !== "All" || sort !== "RecentlyUpdated";

  return (
    <div className="min-h-screen pb-28 sm:pb-12">
      <Masthead />

      {/* Counts + bulletin + new-request button */}
      <section className="container-wide pt-6 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-base text-muted-foreground">
            <span className="font-semibold text-foreground">{counts.Active}</span> active
            <span className="mx-2 text-foreground/30">·</span>
            <span className="font-semibold text-foreground">{counts.Ongoing}</span> ongoing
          </p>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="btn-quiet text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reload from SharePoint"
              aria-label="Refresh list from SharePoint"
            >
              <span aria-hidden className={loading ? "animate-spin inline-block" : "inline-block"}>↻</span>
              <span>{loading ? "Refreshing" : "Refresh"}</span>
            </button>
            {bulletin && (
              <a
                href={bulletin.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm sm:text-base"
                title={bulletin.name}
              >
                Bulletin{bulletin.printedOn && ` · ${safeFormat(bulletin.printedOn, "MMM d")}`}
                <span aria-hidden className="ml-1">↗</span>
              </a>
            )}
            <Link to="/request/new" className="btn-primary hidden sm:inline-flex">
              <span aria-hidden className="text-lg leading-none">＋</span> New request
            </Link>
          </div>
        </div>
      </section>

      {/* Search + filters */}
      <section className="container-wide pb-4">
        <div className="border-y border-foreground/15 py-4">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              searchRef.current?.blur();
            }}
          >
            <input
              ref={searchRef}
              type="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, request, or relationship"
              aria-label="Search"
              className={inputClass}
            />
          </form>

          {/* Mobile: disclosure. Desktop: always visible inline. */}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="sm:hidden mt-3 text-base text-foreground font-medium underline underline-offset-4 decoration-foreground/30 min-h-[44px] inline-flex items-center gap-2"
          >
            {filtersOpen ? "Hide" : "Show"} filters
            {filtersActive && <span className="w-2 h-2 rounded-full bg-primary" aria-hidden />}
          </button>

          <div className={`${filtersOpen ? "grid" : "hidden"} sm:grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4`}>
            <label className="block">
              <span className="eyebrow block mb-2">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as PrayerCategory | "All")}
                className={inputClass}
              >
                <option value="All">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow block mb-2">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className={inputClass}
              >
                <option value="Newest">Most recent</option>
                <option value="RecentlyUpdated">Recently updated</option>
                <option value="LongestOnList">Longest on the list</option>
                <option value="Oldest">Oldest first</option>
                <option value="NameAsc">Name, A → Z</option>
                <option value="NameDesc">Name, Z → A</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      {/* Cleanup nudge — only when there are old active items */}
      {staleCount > 0 && (
        <section className="container-wide pb-2">
          <div className="flex items-center justify-between gap-3 bg-card border border-foreground/15 rounded-lg p-3 sm:p-4">
            <p className="text-sm sm:text-base">
              <span className="font-semibold">{staleCount}</span>{" "}
              {staleCount === 1 ? "request has" : "requests have"} been on the list over 6 months.
            </p>
            <button
              type="button"
              onClick={() => setSort("LongestOnList")}
              className="text-primary font-medium text-sm whitespace-nowrap hover:underline underline-offset-4"
            >
              Show longest first →
            </button>
          </div>
        </section>
      )}

      {/* Entries */}
      <main className="container-wide">
        {error ? (
          <p className="text-center text-destructive py-16 text-lg">
            Could not load the list: {error}
          </p>
        ) : !loaded && loading ? (
          <p className="text-center text-muted-foreground py-16 text-lg">
            Loading the list…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-16 text-lg">
            No requests match your search.
          </p>
        ) : (
          <ul className="divide-y divide-foreground/15">
            {visible.map((item) => {
              const age = daysSince(item.dateSubmitted);
              const stale = age >= STALE_DAYS;
              return (
              <li key={item.id}>
                <Link
                  to={`/request/${item.id}`}
                  className="group flex items-start gap-4 py-5 sm:py-6 px-2 -mx-2 rounded-lg hover:bg-surface-sunken/50 active:bg-surface-sunken transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-2xl sm:text-3xl leading-tight group-hover:text-primary transition-colors">
                      {item.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      <StatusBadge status={item.status} />
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                        {item.category}
                      </span>
                      {stale && (
                        <span className="text-sm text-primary/85 font-medium tabular-nums">
                          {shortAge(age)} on list
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground tabular-nums">
                        Submitted {safeFormat(item.dateSubmitted, "MMM d, yyyy")}
                      </span>
                      <span className="text-sm text-muted-foreground/80 tabular-nums">
                        · updated {safeDistance(item.modified)}
                      </span>
                    </div>
                    {item.relationship && (
                      <p className="text-sm text-muted-foreground mt-1.5">
                        {item.relationship}
                      </p>
                    )}
                    <p className="text-foreground/90 leading-relaxed line-clamp-2 text-base sm:text-lg mt-2">
                      {item.request}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="text-2xl text-muted-foreground/60 group-hover:text-primary leading-none mt-1.5 select-none"
                  >
                    ›
                  </span>
                </Link>
              </li>
              );
            })}
          </ul>
        )}

        {archiveMatches.length > 0 && (
          <section className="mt-12 pt-8 border-t border-foreground/15">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className="text-xl font-semibold">Also in the archive</h2>
              <span className="text-sm text-muted-foreground">
                {archiveMatches.length} {archiveMatches.length === 1 ? "result" : "results"}
              </span>
            </div>
            <ul className="divide-y divide-foreground/15">
              {archiveMatches.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/request/${item.id}`}
                    className="group flex items-start gap-4 py-4 sm:py-5 px-2 -mx-2 rounded-lg hover:bg-surface-sunken/50 active:bg-surface-sunken transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-xl sm:text-2xl leading-tight group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                        <StatusBadge status={item.status} />
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          {item.category}
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          closed {safeFormat(item.modified, "MMM d, yyyy")}
                        </span>
                      </div>
                      <p className="text-foreground/80 leading-relaxed line-clamp-2 text-base mt-2">
                        {item.request}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="text-2xl text-muted-foreground/60 group-hover:text-primary leading-none mt-1.5 select-none"
                    >
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <BuildTag />
      </main>

      {/* Thumb-reachable new-request button — mobile only */}
      <Link
        to="/request/new"
        className="sm:hidden fixed bottom-5 right-5 z-40 btn-primary shadow-xl rounded-full px-6 min-h-[56px] text-base"
        aria-label="Add a new prayer request"
      >
        <span aria-hidden className="text-xl leading-none">＋</span>
        <span>New request</span>
      </Link>
    </div>
  );
};

export default Browse;
