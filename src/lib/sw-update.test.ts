import { describe, expect, it } from "vitest";
import { isStaleBuildError } from "./sw-update";

describe("isStaleBuildError", () => {
  // Real wording, per browser. None of them mention the actual problem, which
  // is why this matches on text rather than on anything structured.
  it.each([
    [
      "Safari",
      new TypeError(
        "'text/html' is not a valid JavaScript MIME type. Load failed for module script."
      ),
    ],
    [
      "Chrome",
      new TypeError(
        "Failed to fetch dynamically imported module: https://example.org/assets/Page-ABC123.js"
      ),
    ],
    [
      "Firefox",
      new TypeError(
        "error loading dynamically imported module: https://example.org/assets/Page-ABC123.js"
      ),
    ],
    ["Chrome (script)", new TypeError("Importing a module script failed.")],
  ])("recognises %s", (_browser, error) => {
    expect(isStaleBuildError(error)).toBe(true);
  });

  it("matches on the error name as well as the message", () => {
    const err = new Error("something opaque");
    err.name = "Failed to fetch dynamically imported module";
    expect(isStaleBuildError(err)).toBe(true);
  });

  it("survives a non-Error being thrown", () => {
    expect(isStaleBuildError("Failed to fetch dynamically imported module: /x.js")).toBe(true);
    expect(isStaleBuildError({ toString: () => "Importing a module script failed." })).toBe(true);
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
    expect(isStaleBuildError(42)).toBe(false);
    expect(isStaleBuildError({})).toBe(false);
  });

  it("leaves ordinary application errors alone", () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleBuildError(new Error("Graph 503: service unavailable"))).toBe(false);
    expect(isStaleBuildError(new Error("Not signed in"))).toBe(false);
  });
});
