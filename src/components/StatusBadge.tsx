import type { PrayerStatus } from "@/lib/prayer-types";

// Each status keeps its own color so the four read as different at a glance:
// teal = live on the list, plum = long-running, sage = answered/closed,
// gray = archived. These are meaning colors, not the brand palette.
const styles: Record<PrayerStatus, string> = {
  Active: "bg-active text-active-foreground",
  Ongoing: "bg-ongoing text-ongoing-foreground",
  Resolved: "bg-resolved text-resolved-foreground",
  Archived: "bg-muted text-muted-foreground border border-hairline",
};

export const StatusBadge = ({ status }: { status: PrayerStatus }) => (
  <span
    className={`inline-flex items-center text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${styles[status]}`}
  >
    {status}
  </span>
);
