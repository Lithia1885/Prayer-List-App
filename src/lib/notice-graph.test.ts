import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./msal", () => ({
  acquireGraphToken: async () => "test-token",
  msalInstance: { getActiveAccount: () => ({ username: "test" }), getAllAccounts: () => [] },
}));

const ME = "sarah.whitfield@lithiaspringsmethodist.org";
const OTHER = "bart.arther@lithiaspringsmethodist.org";

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const item = (title: string, author?: string) => ({
  fields: { Title: title },
  ...(author ? { createdBy: { user: { email: author } } } : {}),
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
    const { graph } = await loadGraph({ lists: NOTICES, items: [item("move-v1", ME)] });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("acknowledged");
  });

  // The guard that matters: if the list's item-level permissions are ever
  // missed, everyone can read everyone's rows, and without this check the
  // first person to press OK would hide the notice from the whole church.
  it("ignores somebody else's acknowledgement", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, items: [item("move-v1", OTHER)] });
    expect(await graph.fetchNoticeState("move-v1", ME)).toBe("unread");
  });

  it("ignores an acknowledgement of a different notice id", async () => {
    const { graph } = await loadGraph({ lists: NOTICES, items: [item("move-v1", ME)] });
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
