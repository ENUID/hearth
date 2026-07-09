import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bundled fonts — the same crisp look on every OS (no system-font roulette).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { initTheme } from "./lib/settings";

initTheme();

// PWA freshness: the service worker precaches the app for offline use, but that
// means a new deploy can keep serving the *old* cached build until a manual
// hard-refresh. registerType:"autoUpdate" installs the new worker and claims
// clients, which fires `controllerchange` — reload once there so the user
// always lands on the latest build. Skip the very first install (no prior
// controller) so a fresh visit doesn't reload under itself.
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
