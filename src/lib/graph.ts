// Thin Microsoft Graph client for the Prayer List SharePoint lists.
// Schema reference: mem://sharepoint/schema.md
import { acquireGraphToken } from "./msal";
import { msalInstance } from "./msal";
import type {
  PrayerRequest,
  PrayerEvent,
  PrayerEventKind,
  PrayerStatus,
  PrayerCategory,
} from "./prayer-types";

export const SITE_ID =
  "lithiaspringsmethodist.sharepoint.com,3425ccd5-677f-413a-8a5e-0c2795a67220,4f0c6b8d-e50f-4079-89ad-14107c71ca83";
export const REQUESTS_LIST_ID = "176cec8e-c1a6-4319-a90a-e048ef4f19cf";
export const EVENTS_LIST_ID = "4140d627-0b20-482d-be5c-3cd3fa85ca14";

const GRAPH = "https://graph.microsoft.com/v1.0";

function toIsoDate(input?: string): string | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

async function token(): Promise<string> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in");
  return acquireGraphToken(account);
}

async function gfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const t = await token();
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- Prayer Requests list ----------

interface RequestFields {
  Title?: string;
  Request?: string;
  Category?: PrayerCategory;
  Status?: PrayerStatus;
  Relationship?: string;
  DateSubmitted?: string; // ISO
  Address?: string;
  Notes?: string;
  // App-controlled "last touched" timestamp. Distinct from SharePoint's system
  // `Modified`, which gets bumped by imports/bulk operations and lies about
  // when a scribe actually edited. We always set this on writes so it tracks
  // the real edit time end-to-end.
  LastUpdated?: string;
  // Manual person-link grouping (see PrayerRequest.personId).
  PersonId?: number;
}

interface ListItem<F> {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
  fields: F & { id: string };
}

interface ListItemsResponse<F> {
  value: ListItem<F>[];
  "@odata.nextLink"?: string;
}

function rowToRequest(item: ListItem<RequestFields>): PrayerRequest {
  const f = item.fields;
  return {
    id: Number(item.id),
    title: f.Title ?? "(untitled)",
    request: f.Request ?? "",
    category: (f.Category ?? "Member") as PrayerCategory,
    status: (f.Status ?? "Active") as PrayerStatus,
    relationship: f.Relationship || undefined,
    // `||` (not `??`) so empty strings fall through to createdDateTime —
    // SharePoint can return "" for blank Date columns and `??` skips that.
    dateSubmitted: (f.DateSubmitted || item.createdDateTime || "").slice(0, 10),
    address: f.Address || undefined,
    notes: f.Notes || undefined,
    // Truth-prioritized fallback chain:
    //   1. LastUpdated — set by every app write, the real "last touched"
    //   2. DateSubmitted — for historical imports without LastUpdated, this is
    //      at least an honest floor ("hasn't been touched in app since at least
    //      it was first listed"). Better than the system Modified field, which
    //      bulk imports bump to "now" and lie about activity.
    //   3. createdDateTime — last-resort fallback if both are blank.
    modified: f.LastUpdated || f.DateSubmitted || item.createdDateTime,
    created: item.createdDateTime,
    author: item.createdBy?.user?.displayName ?? "Unknown",
    personId: typeof f.PersonId === "number" ? f.PersonId : undefined,
  };
}

export async function fetchRequests(): Promise<PrayerRequest[]> {
  const all: ListItem<RequestFields>[] = [];
  let url: string | undefined =
    `/sites/${SITE_ID}/lists/${REQUESTS_LIST_ID}/items?expand=fields&$top=200`;
  while (url) {
    const page = await gfetch<ListItemsResponse<RequestFields>>(url);
    all.push(...page.value);
    const next = page["@odata.nextLink"];
    url = next ? next.replace(GRAPH, "") : undefined;
  }
  return all.map(rowToRequest);
}

export async function createRequest(
  p: Omit<PrayerRequest, "id" | "modified" | "created" | "author">
): Promise<PrayerRequest> {
  const fields: RequestFields = {
    Title: p.title,
    Request: p.request,
    Category: p.category,
    Status: p.status,
    Relationship: p.relationship,
    DateSubmitted: toIsoDate(p.dateSubmitted),
    Address: p.address,
    Notes: p.notes,
    LastUpdated: new Date().toISOString(),
  };
  const created = await gfetch<ListItem<RequestFields>>(
    `/sites/${SITE_ID}/lists/${REQUESTS_LIST_ID}/items?expand=fields`,
    { method: "POST", body: JSON.stringify({ fields }) }
  );
  return rowToRequest(created);
}

// `personId: null` clears the link; `undefined` leaves it untouched.
export type RequestPatch = Partial<Omit<PrayerRequest, "personId">> & {
  personId?: number | null;
};

export interface PatchRequestOptions {
  // When false, the LastUpdated bump is skipped. Use for housekeeping writes
  // (linking, merge bookkeeping) that shouldn't re-surface a record in the
  // "Recently updated" sort. Default true — pastoral writes (text edits,
  // status, post updates) keep the modified timestamp honest.
  touch?: boolean;
}

export async function patchRequest(
  id: number,
  patch: RequestPatch,
  opts: PatchRequestOptions = {}
): Promise<void> {
  const touch = opts.touch ?? true;
  const fields: RequestFields = touch
    ? { LastUpdated: new Date().toISOString() }
    : {};
  if (patch.title !== undefined) fields.Title = patch.title;
  if (patch.request !== undefined) fields.Request = patch.request;
  if (patch.category !== undefined) fields.Category = patch.category;
  if (patch.status !== undefined) fields.Status = patch.status;
  if (patch.relationship !== undefined) fields.Relationship = patch.relationship;
  if (patch.dateSubmitted !== undefined) {
    fields.DateSubmitted = toIsoDate(patch.dateSubmitted);
  }
  if (patch.address !== undefined) fields.Address = patch.address;
  if (patch.notes !== undefined) fields.Notes = patch.notes;
  // PersonId === undefined means "don't touch"; null clears the link.
  if (patch.personId !== undefined) {
    // SharePoint expects null to clear a Number column, not 0.
    fields.PersonId = patch.personId === null ? (null as unknown as number) : patch.personId;
  }

  await gfetch(
    `/sites/${SITE_ID}/lists/${REQUESTS_LIST_ID}/items/${id}/fields`,
    { method: "PATCH", body: JSON.stringify(fields) }
  );
}

export async function deleteRequest(id: number): Promise<void> {
  await gfetch(`/sites/${SITE_ID}/lists/${REQUESTS_LIST_ID}/items/${id}`, {
    method: "DELETE",
  });
}

// ---------- PrayerEvents list ----------

interface EventFields {
  Title?: string;
  RequestId?: number;
  Kind?: PrayerEventKind;
  At?: string;
  ByName?: string;
  ByUpn?: string;
  FromValue?: string;
  ToValue?: string;
  NoteText?: string;
}

function rowToEvent(item: ListItem<EventFields>): PrayerEvent {
  const f = item.fields;
  return {
    id: Number(item.id),
    requestId: Number(f.RequestId ?? 0),
    kind: (f.Kind ?? "edited") as PrayerEventKind,
    at: f.At ?? item.createdDateTime,
    by: f.ByName ?? item.createdBy?.user?.displayName ?? "Unknown",
    from: f.FromValue || undefined,
    to: f.ToValue || undefined,
    note: f.NoteText || undefined,
  };
}

export async function fetchEvents(): Promise<PrayerEvent[]> {
  const all: ListItem<EventFields>[] = [];
  let url: string | undefined =
    `/sites/${SITE_ID}/lists/${EVENTS_LIST_ID}/items?expand=fields&$top=500`;
  while (url) {
    const page = await gfetch<ListItemsResponse<EventFields>>(url);
    all.push(...page.value);
    const next = page["@odata.nextLink"];
    url = next ? next.replace(GRAPH, "") : undefined;
  }
  return all.map(rowToEvent);
}

export interface NewEventInput {
  requestId: number;
  kind: PrayerEventKind;
  byName: string;
  byUpn?: string;
  from?: string;
  to?: string;
  note?: string;
  title?: string;
}

export async function createEvent(input: NewEventInput): Promise<PrayerEvent> {
  const titleFallback: Record<PrayerEventKind, string> = {
    created: "Created",
    status: `Status: ${input.from ?? "?"} → ${input.to ?? "?"}`,
    edited: "Edited",
    note: "Note added",
    merged: "Merged from another record",
  };
  const fields: EventFields = {
    Title: input.title ?? titleFallback[input.kind],
    RequestId: input.requestId,
    Kind: input.kind,
    At: new Date().toISOString(),
    ByName: input.byName,
    ByUpn: input.byUpn,
    FromValue: input.from,
    ToValue: input.to,
    NoteText: input.note,
  };
  const created = await gfetch<ListItem<EventFields>>(
    `/sites/${SITE_ID}/lists/${EVENTS_LIST_ID}/items?expand=fields`,
    { method: "POST", body: JSON.stringify({ fields }) }
  );
  return rowToEvent(created);
}

// ---------- Weekly bulletin (Power Automate output) ----------

// The Wednesday-1:30pm flow drops PDFs in `/Prayer List Archive/` named
// `prayer_list_YYYYMMDD.pdf`. Sorting by name desc = sorting by print-date desc,
// which is more reliable than sorting by modified time (a bulk-archive cleanup
// could touch modified without actually being a new bulletin).
export interface BulletinFile {
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
  /** Date parsed from the filename, in the local timezone, or null if unparseable. */
  printedOn: Date | null;
}

const BULLETIN_NAME = "Prayer List Archive";

const parsePrintedOn = (filename: string): Date | null => {
  const m = filename.match(/prayer_list_(\d{4})(\d{2})(\d{2})\.pdf/i);
  if (!m) return null;
  // Construct from local-time components — `new Date("YYYY-MM-DD")` is parsed
  // as UTC midnight, which displays as the *previous* day in any timezone
  // west of GMT (e.g., April 29 UTC = April 28 8pm Eastern). Using the Date
  // constructor's numeric form keeps it in the local zone.
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export interface DriveItem {
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
}

const toBulletin = (pdf: DriveItem): BulletinFile => ({
  name: pdf.name,
  webUrl: pdf.webUrl,
  lastModifiedDateTime: pdf.lastModifiedDateTime,
  printedOn: parsePrintedOn(pdf.name),
});

export const pickLatestPdf = (items: DriveItem[]): DriveItem | undefined =>
  // Filter to PDFs first, then prefer name-desc sort (filename embeds the
  // print date). Fall back to lastModified if names don't match the pattern.
  // Order-independent on purpose: never assume the caller was handed the
  // archive in any particular sequence.
  items
    .filter((f) => /\.pdf$/i.test(f.name))
    .sort((a, b) => {
      const ad = parsePrintedOn(a.name);
      const bd = parsePrintedOn(b.name);
      if (ad && bd) return bd.getTime() - ad.getTime();
      return b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime);
    })[0];

// Read every page of a children collection.
//
// `?$top=N` alone is a trap here: Graph returns children in the library's own
// order — name ascending in practice — so one truncated page is the OLDEST N
// files, and `prayer_list_YYYYMMDD.pdf` sorts oldest-first by name. Once the
// archive passed 25 PDFs the app quietly served the previous Wednesday's
// sheet, drifting a week further behind every week, with no error to notice
// (observed 2026-09-13: Sep 9 in the archive, Sep 2 on the button). Paging
// costs one extra request per few hundred weeks of archive and removes the
// assumption entirely.
async function listAllChildren(collectionPath: string): Promise<DriveItem[]> {
  const query = new URLSearchParams({
    $top: "200",
    $select: "name,webUrl,lastModifiedDateTime",
  }).toString();
  const all: DriveItem[] = [];
  let url: string | undefined = `${collectionPath}?${query}`;
  while (url) {
    const page = await gfetch<{
      value: DriveItem[];
      "@odata.nextLink"?: string;
    }>(url);
    all.push(...page.value);
    const next = page["@odata.nextLink"];
    url = next ? next.replace(GRAPH, "") : undefined;
  }
  return all;
}

export async function fetchLatestBulletin(): Promise<BulletinFile | null> {
  // Strategy 1: a sibling document library called "Prayer List Archive".
  // The Power Automate `folderPath: "/Prayer List Archive"` syntax usually
  // points at a library at site root, not a folder in the default library.
  try {
    const drives = await gfetch<{ value: { id: string; name: string }[] }>(
      `/sites/${SITE_ID}/drives`
    );
    const lib = drives.value.find(
      (d) => d.name.toLowerCase() === BULLETIN_NAME.toLowerCase()
    );
    if (lib) {
      const pdf = pickLatestPdf(await listAllChildren(`/drives/${lib.id}/root/children`));
      if (pdf) return toBulletin(pdf);
    }
  } catch (e) {
    console.warn("[bulletin] library lookup failed:", e);
  }

  // Strategy 2: a folder named "Prayer List Archive" inside the default
  // Documents library.
  try {
    const folder = encodeURIComponent(BULLETIN_NAME);
    const pdf = pickLatestPdf(
      await listAllChildren(`/sites/${SITE_ID}/drive/root:/${folder}:/children`)
    );
    if (pdf) return toBulletin(pdf);
  } catch (e) {
    console.warn("[bulletin] folder lookup failed:", e);
  }

  console.warn(
    "[bulletin] no PDF found in '%s' as either a library or a folder. " +
      "Check where Power Automate is actually saving the file.",
    BULLETIN_NAME
  );
  return null;
}

// ---------- Notices (read receipts for the standing banner) ----------

// One row per person per notice, and nothing else: Title holds the notice id,
// and SharePoint's own Author and Created columns record who and when. The
// browser sends no identity and no timestamp — there is nothing to spoof and
// nothing to keep in sync.
//
// Addressed by name rather than a hardcoded id because this list is created by
// hand on the site (OPERATIONS.md §2) and has no stable id in source. Resolved
// once per session.
const NOTICES_LIST_NAME = "Notices";

interface SiteList {
  id: string;
  name?: string;
  displayName?: string;
}

// undefined = not looked up yet; null = looked up and absent.
let noticesListId: string | null | undefined;

async function resolveNoticesListId(): Promise<string | null> {
  if (noticesListId !== undefined) return noticesListId;
  try {
    const res = await gfetch<{ value: SiteList[] }>(
      `/sites/${SITE_ID}/lists?$select=id,name,displayName`
    );
    const match = res.value.find(
      (l) =>
        l.displayName?.toLowerCase() === NOTICES_LIST_NAME.toLowerCase() ||
        l.name?.toLowerCase() === NOTICES_LIST_NAME.toLowerCase()
    );
    noticesListId = match?.id ?? null;
  } catch (e) {
    console.warn("[notice] could not look up the Notices list:", e);
    noticesListId = null;
  }
  if (noticesListId === null) {
    console.warn(
      "[notice] no '%s' list on the site — the banner stays hidden until it exists (OPERATIONS.md §2).",
      NOTICES_LIST_NAME
    );
  }
  return noticesListId;
}

export type NoticeState =
  /** No Notices list, or it couldn't be read. Show nothing at all. */
  | "unavailable"
  /** This person has no row for this notice id. */
  | "unread"
  | "acknowledged";

interface NoticeItem {
  // `createdBy.user.id` is the Entra object id — the account's permanent
  // identifier. Email and userPrincipalName are display-level and can differ
  // from each other and from the sign-in name, so neither is used here.
  createdBy?: { user?: { id?: string } };
  fields?: { Title?: string };
}

/**
 * Has this person already read this notice?
 *
 * The list's item-level permissions should already limit each person to their
 * own rows, but the Author check is kept anyway: if that setting is ever
 * missed, everyone can read everyone's rows, and without this check the first
 * person to press OK would hide the notice from the whole church.
 *
 * Matched on the Entra object id, on both sides. A row whose author carries no
 * id is nobody's — counting it as the reader's would defeat the whole check.
 */
export async function fetchNoticeState(
  noticeId: string,
  accountId: string
): Promise<NoticeState> {
  const listId = await resolveNoticesListId();
  if (!listId) return "unavailable";
  try {
    const res = await gfetch<{ value: NoticeItem[] }>(
      `/sites/${SITE_ID}/lists/${listId}/items?expand=fields($select=Title)&$top=200`
    );
    const mine = res.value.some((item) => {
      if (item.fields?.Title !== noticeId) return false;
      const author = item.createdBy?.user?.id;
      return !!author && !!accountId && author === accountId;
    });
    return mine ? "acknowledged" : "unread";
  } catch (e) {
    console.warn("[notice] could not read acknowledgements:", e);
    return "unavailable";
  }
}

/** Record that this person has read this notice. Title only, by design. */
export async function acknowledgeNotice(noticeId: string): Promise<void> {
  const listId = await resolveNoticesListId();
  if (!listId) throw new Error("No Notices list on the site.");
  await gfetch(`/sites/${SITE_ID}/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ fields: { Title: noticeId } }),
  });
}

// Re-point an event row at a different request — used by the merge action to
// move all events from a duplicate record onto the canonical one.
export async function patchEventRequestId(eventId: number, newRequestId: number): Promise<void> {
  await gfetch(
    `/sites/${SITE_ID}/lists/${EVENTS_LIST_ID}/items/${eventId}/fields`,
    {
      method: "PATCH",
      body: JSON.stringify({ RequestId: newRequestId }),
    }
  );
}
