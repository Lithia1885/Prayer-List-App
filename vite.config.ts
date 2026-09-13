import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

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
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // The popup-callback page is a separate document — it must not be intercepted
      // by the SPA shell, and MSAL handles its own freshness there.
      injectRegister: "auto",
      includeAssets: ["robots.txt", "icon-512.png", "icon-maskable-512.png", "lsmc-logo-ink.svg"],
      workbox: {
        // Fonts are part of the shell: an installed app should look like
        // itself offline, not fall back to the system face.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        // Don't let the SW hijack the auth popup redirect — it needs to load clean
        // from the network so MSAL's hash-response handler runs.
        navigateFallbackDenylist: [/^\/auth-popup\.html$/],
        // Graph calls should never be cached — prayer list data must be fresh.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/graph\.microsoft\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/login\.microsoftonline\.com\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
      manifest: {
        name: "Prayer List · Lithia Springs Methodist",
        short_name: "Prayer List",
        description: "The prayer team's working list for Lithia Springs Methodist Church.",
        // theme_color tints the browser/OS chrome and matches the church
        // site's own theme-color; background_color is the launch splash, so
        // it matches the app's page instead.
        theme_color: "#faf9f6",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        // The church's own icon (the one its website uses), plus a padded
        // copy for launchers that crop to a shape.
        icons: [
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
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
