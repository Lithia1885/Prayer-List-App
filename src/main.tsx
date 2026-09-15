import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { msalReady } from "./lib/msal";
import { registerServiceWorker } from "./lib/sw-update";

// Before the UI mounts and outside the auth gate, so a browser parked on the
// sign-in screen still registers and still gets offered updates. Deliberately
// not inside the msalReady chain: a slow or failed MSAL init must not be able
// to stop the app from being able to update itself.
registerServiceWorker();

// Wait for MSAL to initialize and process any redirect response BEFORE
// React renders, so useIsAuthenticated reads the correct state on first paint.
msalReady.finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
