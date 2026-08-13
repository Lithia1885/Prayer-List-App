// The build totem — answers "am I looking at the newest build?" without
// opening devtools, which matters on an installed PWA where a stale service
// worker can pin someone to last week's app. Compare the seven characters
// against the latest commit on main; the date is when the bundle was built.
//
// VITE_BUILD_ID is the commit SHA, injected by the Azure deploy workflow;
// __BUILD_DATE__ is stamped by Vite at build time. Local dev shows "dev".
const sha = import.meta.env.VITE_BUILD_ID?.slice(0, 7) ?? "dev";

export const BuildTag = () => (
  <p className="text-center text-xs text-muted-foreground/60 tabular-nums py-6 select-all">
    build {sha} · {__BUILD_DATE__}
  </p>
);
