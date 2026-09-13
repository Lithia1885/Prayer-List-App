import { useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Masthead } from "@/components/Masthead";
import { safeFormat, safeTime } from "@/lib/dates";
import { StatusBadge } from "@/components/StatusBadge";
import { usePrayerStore } from "@/lib/prayer-store";
import { CATEGORIES, type PrayerCategory } from "@/lib/prayer-types";

type Tab = "All" | "Resolved" | "Archived";
const TAB_VALUES: readonly Tab[] = ["All", "Resolved", "Archived"];
const DEFAULT_TAB: Tab = "All";

type SortMode =
  | "RecentlyClosed"
  | "EarliestClosed"
  | "SubmittedRecent"
  | "SubmittedEarly"
  | "NameAsc"
  | "NameDesc";
const SORT_VALUES: readonly SortMode[] = [
  "RecentlyClosed",
  "EarliestClosed",
  "SubmittedRecent",
  "SubmittedEarly",
  "NameAsc",
  "NameDesc",
];
const DEFAULT_SORT: SortMode = "RecentlyClosed";

const Archive = () => {
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

  // Persist filter state in the URL so it survives navigating into a request
  // and back. `replace: true` avoids polluting back-history with each keystroke.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)
    ? (tabParam as Tab)
    : DEFAULT_TAB;
  const catParam = searchParams.get("cat");
  const categoryFilter: PrayerCategory | "All" =
    catParam && (CATEGORIES as readonly string[]).includes(catParam)
      ? (catParam as PrayerCategory)
      : "All";
  const sortParam = searchParams.get("sort");
  const sort: SortMode =
    sortParam && (SORT_VALUES as readonly string[]).includes(sortParam)
      ? (sortParam as SortMode)
      : DEFAULT_SORT;

  const updateParam = (key: string, value: string, isDefault: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (isDefault || !value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const setQuery = (v: string) => updateParam("q", v, false);
  const setTab = (v: Tab) => updateParam("tab", v, v === DEFAULT_TAB);
  const setCategoryFilter = (v: PrayerCategory | "All") => updateParam("cat", v, v === "All");
  const setSort = (v: SortMode) => updateParam("sort", v, v === DEFAULT_SORT);

  const searchRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) =>
        tab === "Resolved" ? i.status === "Resolved" :
        tab === "Archived" ? i.status === "Archived" :
        i.status === "Resolved" || i.status === "Archived"
      )
      .filter((i) => {
        if (categoryFilter !== "All" && i.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.request.toLowerCase().includes(q) ||
          (i.relationship?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "RecentlyClosed":   return safeTime(b.modified) - safeTime(a.modified);
          case "EarliestClosed":   return safeTime(a.modified) - safeTime(b.modified);
          case "SubmittedRecent":  return safeTime(b.dateSubmitted) - safeTime(a.dateSubmitted);
          case "SubmittedEarly":   return safeTime(a.dateSubmitted) - safeTime(b.dateSubmitted);
          case "NameAsc":          return a.title.localeCompare(b.title);
          case "NameDesc":         return b.title.localeCompare(a.title);
        }
      });
  }, [items, tab, query, categoryFilter, sort]);

  const filtersActive =
    query.trim().length > 0 || categoryFilter !== "All" || sort !== DEFAULT_SORT;

  return (
    <div className="min-h-screen pb-12">
      <Masthead />

      <section className="container-wide pt-6 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">Archive</h1>
            <p className="text-base text-muted-foreground mt-1">Resolved and archived requests.</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="btn-quiet text-sm sm:text-base shrink-0"
            title="Reload from SharePoint"
            aria-label="Refresh archive from SharePoint"
          >
            <span aria-hidden className={loading ? "animate-spin inline-block" : "inline-block"}>↻</span>
            <span>{loading ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </section>

      {/* Search */}
      <section className="container-wide pt-2">
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
            aria-label="Search archive"
            className="field"
          />
        </form>
      </section>

      {/* Tabs */}
      <section className="container-wide pt-4 pb-2">
        <div role="tablist" aria-label="Archive sections" className="grid grid-cols-3 border-y border-separator">
          {(["All", "Resolved", "Archived"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`text-sm sm:text-base py-4 min-h-[48px] border-b-2 transition-colors ${
                tab === t
                  ? "border-accent text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Category filter + Sort */}
      <section className="container-wide pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="eyebrow block mb-2">Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as PrayerCategory | "All")}
              className="field"
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
              className="field"
            >
              <option value="RecentlyClosed">Recently closed</option>
              <option value="EarliestClosed">Earliest closed</option>
              <option value="SubmittedRecent">Submitted recently</option>
              <option value="SubmittedEarly">Submitted earliest</option>
              <option value="NameAsc">Name, A → Z</option>
              <option value="NameDesc">Name, Z → A</option>
            </select>
          </label>
        </div>
      </section>

      <main className="container-wide">
        {error ? (
          <div className="text-center py-16">
            <p className="text-lg text-destructive">Could not load the archive.</p>
            <p className="text-sm text-muted-foreground mt-2 break-words">{error}</p>
            <button type="button" onClick={onRefresh} className="btn-secondary mt-6">
              Try again
            </button>
          </div>
        ) : !loaded && loading ? (
          <p className="text-center text-muted-foreground py-16 text-lg">
            Loading the archive…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-16 text-lg">
            {filtersActive ? "No archived requests match your search." : "Nothing here yet."}
          </p>
        ) : (
          <ul className="divide-y divide-separator">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/request/${item.id}`}
                  className="group flex items-start gap-4 py-5 sm:py-6 px-2 -mx-2 rounded-lg hover:bg-surface-sunken/60 active:bg-surface-sunken transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-2xl leading-tight group-hover:text-primary transition-colors">
                      {item.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      <StatusBadge status={item.status} />
                      <span className="meta-caps">{item.category}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        Submitted {safeFormat(item.dateSubmitted, "MMM d, yyyy")}
                      </span>
                      <span className="text-sm text-muted-foreground/80 tabular-nums">
                        · closed {safeFormat(item.modified, "MMM d, yyyy")}
                      </span>
                    </div>
                    <p className="text-foreground/85 leading-relaxed line-clamp-2 text-base sm:text-lg mt-2">
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
        )}
      </main>
    </div>
  );
};

export default Archive;
