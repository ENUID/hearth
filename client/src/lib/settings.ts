import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type CursorStyle = "block" | "bar" | "underline";
export type KeyBarPref = "auto" | "on" | "off";

export interface Settings {
  theme: ThemePref;
  fontSize: number;
  cursorStyle: CursorStyle;
  keyBar: KeyBarPref;
}

export type Snapshot = Settings & { resolved: "light" | "dark" };

const KEY = "hearth_settings";
const DEFAULTS: Settings = { theme: "system", fontSize: 14, cursorStyle: "block", keyBar: "auto" };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function systemDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}
function resolve(t: ThemePref): "light" | "dark" {
  return t === "system" ? (systemDark() ? "dark" : "light") : t;
}

let current: Settings = load();
let snapshot: Snapshot = { ...current, resolved: resolve(current.theme) };
const listeners = new Set<() => void>();

function applyDoc() {
  document.documentElement.dataset.theme = snapshot.resolved;
}
function notify() {
  snapshot = { ...current, resolved: resolve(current.theme) };
  applyDoc();
  listeners.forEach((l) => l());
}

export function getSettings(): Snapshot {
  return snapshot;
}
export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  notify();
}
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Apply the saved theme to <html> and track system changes. Call once at boot. */
export function initTheme(): void {
  applyDoc();
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      if (current.theme === "system") notify();
    });
}

export function useSettings(): Snapshot {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
