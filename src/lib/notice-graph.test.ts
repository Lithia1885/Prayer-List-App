import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./msal", () => ({
  acquireGraphToken: async () => "test-token",
  msalInstance: { getActiveAccount: () => ({ username: "test" }), getAllAccounts: () => [] },
}));

// Entra object ids — the permanent account identifier, which is what a row's
// author is matched on. Sign-in names and email addresses appear here only in
// the test that proves they are NOT what decides.
const ME = "6a1f0c2e-9d44-4b7a-8f31-0b5c7e2a4d18";
const OTHER = "c47d93b1-2e58-4a06-9c7f-1d83ea560b92";
const MY_EMAIL = "sarah.whitfield@lithiaspringsmethodist.org";

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const item = (title: string, user?: Record<string, string>) => ({
  fields: { Title: title },
  ...(user ? { createdBy: { user } } : {}),
});

interface Call {
  url: string;
  method: string;
  body?: string;
}

/** Fresh module each time — the resolved list id is cached per session. */
const loadGraph = async (opts: { lists?: unknown[]; items?: unknown[]; itemsFail?: boolean }) => {
  vi.resetModules();
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body as string });
    if (url.includes("/lists?$select")) return json({ value: opts.lists ?? [] });
    if (url.includes("/items")) {
      if (opts.itemsFail) return json({ error: "boom" }, 500);
      if (init?.method === "POST") return json({ id: "1" }, 201);
      return json({ value: opts.items ?? [] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return { calls, graph: await import("./graph") };
};

const NOTICES = [{ id: "notices-1", displayName: "Notices", name: "Notices" }];

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("fetchNoticeState", () => {
  it("is unavailable when the site has no Notices list — the banner stays hidden", async () => {
    const { graph } = await loadGraph({ lists: [{ id: "x", displayName: "Prayer Requests" }] });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unavailable");
  });

  it("is unread when the list exists but this person has no row", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, items: [] });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unread");
  });

  it("is acknowledged when this person's own row is there", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, items: [item("move-v1", { id: ME })] });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("acknowledged");
  });

  // The guard that matters: if the list's item-level permissions are ever
  // missed, everyone can read everyone's rows, and without this check the
  // first person to press OK would hide the notice from the whole church.
  it("ignores somebody else's acknowledgement", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, items: [item("move-v1", { id: OTHER })] });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unread");
  });

  // A row with no author id is nobody's. Counting it as the reader's would
  // defeat the check above in exactly the case it exists for.
  it("ignores a row whose author carries no id", async () => {
    const { graph } = await loadGraph({
      lists: NOTICES,
      items: [item("move-v1"), item("move-v1", { displayName: "Someone" })],
    });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unread");
  });

  // Email and sign-in name are display-level and can differ from each other.
  // The object id is the only thing that decides.
  it("does not accept a matching email when the id is somebody else's", async () => {
    const { graph } = await loadGraph({
      lists: NOTICES,
      items: [item("move-v1", { id: OTHER, email: MY_EMAIL, userPrincipalName: MY_EMAIL })],
    });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unread");
  });

  it("ignores an acknowledgement of a different notice id", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, items: [item("move-v1", { id: ME })] });
    expect(await graph.fetchNoticeState("move-v2", ME)).toBe("unread");
  });

  it("is unavailable, not unread, when the rows cannot be read", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, itemsFail: true });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unavailable");
  });

  it("looks the list up once and reuses it", async () => {
    const { graph, calls } = await loadGraph({ lists: NOTICES, items: [] });
    await graph.fetchNoticeState("move-v1", ME);
    await graph.fetchNoticeState("move-v1", ME);
    expect(calls.filter((c) => c.url.includes("/lists?$select"))).toHaveLength(1);
  });
});

describe("acknowledgeNotice", () => {
  it("writes one row carrying the notice id and nothing else", async () => {
    const { graph, calls } = await loadGraph({ lists: NOTICES, items: [] });
    await graph.acknowledgeNotice("move-v1");

    const post = calls.find((c) => c.method === "POST");
    expect(post).toBeDefined();
    const body = JSON.parse(post!.body!);
    expect(body).toEqual({ fields: { Title: "move-v1" } });

    // No identity and no timestamp from the browser — SharePoint's own Author
    // and Created columns are the record.
    const serialised = JSON.stringify(body).toLowerCase();
    for (const leak of ["author", "upn", "user", "email", "created", "date", "time", ME]) {
      expect(serialised).not.toContain(leak.toLowerCase());
    }
  });

  it("throws rather than silently doing nothing when the list is absent", async () => {
    const { graph } = await loadGraph({ lists: [] });
    await expect(graph.acknowledgeNotice("move-v1")).rejects.toThrow(/Notices list/);
  });
});
