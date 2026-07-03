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
import { initTheme } from "./lib/settings";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
