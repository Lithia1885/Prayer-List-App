import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  define: {
    // Build totem: the date this bundle was produced. The commit half of the
    // totem (VITE_BUILD_ID) comes from the deploy workflow's env instead —
    // the Oryx build container doesn't reliably have git available.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Note: don't add @tanstack/query-core here — it isn't a direct dep, and
    // listing it forces Rollup to resolve a non-hoisted package and breaks the
    // production build (and therefore the Azure deploy).
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query"],
  },
}));
