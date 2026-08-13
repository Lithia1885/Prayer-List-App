/// <reference types="vite/client" />

// Build totem globals (see src/components/BuildTag.tsx).
// __BUILD_DATE__ is injected by the `define` block in vite.config.ts;
// VITE_BUILD_ID is set by the Azure deploy workflow (the commit SHA).
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_BUILD_ID?: string;
}
