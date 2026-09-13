import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestBulletin, pickLatestPdf, type DriveItem } from "./graph";

vi.mock("./msal", () => ({
  acquireGraphToken: async () => "test-token",
  msalInstance: { getActiveAccount: () => ({ username: "test" }), getAllAccounts: () => [] },
}));

const item = (name: string, lastModifiedDateTime = "2026-01-01T00:00:00Z"): DriveItem => ({
  name,
  webUrl: `https://example.invalid/${name}`,
  lastModifiedDateTime,
});

describe("pickLatestPdf", () => {
  it("picks the newest by the date in the filename, whatever order it arrives in", () => {
    const picked = pickLatestPdf([
      item("prayer_list_20260902.pdf"),
      item("prayer_list_20260909.pdf"),
      item("prayer_list_20260826.pdf"),
    ]);
    expect(picked?.name).toBe("prayer_list_20260909.pdf");
  });

  // The regression: the archive is served name-ascending, so the newest sheet
  // is the LAST thing in the list. Truncating that list is what put the app a
  // week behind; the picker must not care where in the array it lands.
  it("finds the newest sheet at the end of a long name-ascending archive", () => {
    const archive = Array.from({ length: 60 }, (_, i) =>
      item(`prayer_list_2025${String(i + 1).padStart(4, "0")}.pdf`)
    );
    archive.push(item("prayer_list_20260909.pdf"));
    expect(pickLatestPdf(archive)?.name).toBe("prayer_list_20260909.pdf");
  });

  it("ignores non-PDFs", () => {
    const picked = pickLatestPdf([
      item("prayer_list_20260902.pdf"),
      item("prayer_list_20260909.docx"),
      item("Forms"),
    ]);
    expect(picked?.name).toBe("prayer_list_20260902.pdf");
  });

  it("falls back to last-modified when no filename carries a date", () => {
    const picked = pickLatestPdf([
      item("old scan.pdf", "2026-03-01T00:00:00Z"),
      item("bulletin final.pdf", "2026-07-04T00:00:00Z"),
    ]);
    expect(picked?.name).toBe("bulletin final.pdf");
  });

  it("returns undefined for an empty archive", () => {
    expect(pickLatestPdf([])).toBeUndefined();
  });
});

describe("fetchLatestBulletin", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The actual regression, end to end: the archive is bigger than one page,
  // and Graph hands back the oldest files first. Before the fix this asked
  // for a single $top=25 page and confidently returned the wrong Wednesday.
  it("follows @odata.nextLink so a sheet on a later page still wins", async () => {
    const GRAPH = "https://graph.microsoft.com/v1.0";
    const pageOne = Array.from({ length: 200 }, (_, i) => ({
      name: `prayer_list_2025${String(i + 1).padStart(4, "0")}.pdf`,
      webUrl: "https://example.invalid/old.pdf",
      lastModifiedDateTime: "2025-01-01T00:00:00Z",
    }));
    const calls: string[] = [];
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url.includes("/drives") && !url.includes("/root/children")) {
        return json({ value: [{ id: "lib1", name: "Prayer List Archive" }] });
      }
      if (url.includes("page2")) {
        return json({
          value: [
            {
              name: "prayer_list_20260909.pdf",
              webUrl: "https://example.invalid/prayer_list_20260909.pdf",
              lastModifiedDateTime: "2026-09-09T17:37:00Z",
            },
          ],
        });
      }
      return json({ value: pageOne, "@odata.nextLink": `${GRAPH}/drives/lib1/root/children?page2` });
    });

    const bulletin = await fetchLatestBulletin();

    expect(bulletin?.name).toBe("prayer_list_20260909.pdf");
    expect(calls.filter((c) => c.includes("/root/children"))).toHaveLength(2);
  });
});
