import { describe, expect, it } from "vitest";
import { escapeStrandedPopup } from "./msal";

// The shape MSAL checks: an opener that isn't this window, plus a name it gave
// the popup. Reproduced here rather than mocked, because the whole point is
// matching what MSAL looks at.
const strandedPopup = () => {
  const opener = { name: "" };
  return { name: "msal.7c3f1a2b-0000-4aaa-9999-abcdef012345", opener };
};

describe("escapeStrandedPopup", () => {
  it("clears the name of a window still flagged as MSAL's popup", () => {
    const win = strandedPopup();
    expect(escapeStrandedPopup(win)).toBe(true);
    expect(win.name).toBe("");
  });

  it("leaves an ordinary app window alone", () => {
    const win = { name: "", opener: null };
    expect(escapeStrandedPopup(win)).toBe(false);
  });

  it("leaves a window opened by something else alone", () => {
    // Opened from another page, but not by MSAL — not ours to tamper with.
    const win = { name: "printPreview", opener: {} };
    expect(escapeStrandedPopup(win)).toBe(false);
    expect(win.name).toBe("printPreview");
  });

  it("ignores a window with an MSAL-ish name but no opener", () => {
    const win = { name: "msal.abc", opener: null };
    expect(escapeStrandedPopup(win)).toBe(false);
    expect(win.name).toBe("msal.abc");
  });

  it("ignores a window that is its own opener", () => {
    const win: { name: string; opener?: unknown } = { name: "msal.abc" };
    win.opener = win;
    expect(escapeStrandedPopup(win)).toBe(false);
    expect(win.name).toBe("msal.abc");
  });

  it("does not trip on a name that merely starts with the letters msal", () => {
    const win = { name: "msalvage", opener: {} };
    expect(escapeStrandedPopup(win)).toBe(false);
    expect(win.name).toBe("msalvage");
  });

  it("tolerates a missing or non-string name", () => {
    expect(escapeStrandedPopup({ opener: {} })).toBe(false);
    expect(escapeStrandedPopup({ name: 42, opener: {} })).toBe(false);
  });

  it("is idempotent — a second pass finds nothing to do", () => {
    const win = strandedPopup();
    expect(escapeStrandedPopup(win)).toBe(true);
    expect(escapeStrandedPopup(win)).toBe(false);
  });
});
