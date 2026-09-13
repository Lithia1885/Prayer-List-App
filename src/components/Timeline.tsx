import type { PrayerEvent } from "@/lib/prayer-types";
import { safeFormat, safeDistance } from "@/lib/dates";

const kindLabel = (e: PrayerEvent): string => {
  switch (e.kind) {
    case "created": return "Added to the list";
    case "status":  return `Marked ${e.to}`;
    case "edited":  return "Updated";
    case "note":    return "Update posted";
    case "merged":  return "Merged from another record";
  }
};

export const Timeline = ({ events }: { events: PrayerEvent[] }) => {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-base">
        Nothing recorded yet.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-hairline ml-2 sm:ml-3 space-y-6">
      {events.map((e) => (
        <li key={e.id} className="pl-5 sm:pl-6 relative">
          <span
            aria-hidden
            className="absolute -left-[5px] top-2 w-[9px] h-[9px] rounded-full bg-accent"
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-base font-semibold leading-tight text-foreground">
              {kindLabel(e)}
              {e.kind === "status" && e.from && (
                <span className="text-sm text-muted-foreground font-normal ml-2">
                  (was {e.from})
                </span>
              )}
            </span>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums mt-0.5">
            {safeFormat(e.at, "MMM d, yyyy")}
            <span className="mx-1.5">·</span>
            {e.by}
            <span className="mx-1.5">·</span>
            {safeDistance(e.at)}
          </p>
          {e.note && (
            <p className="mt-2 text-foreground/90 leading-relaxed text-base sm:text-lg">
              {e.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
};
