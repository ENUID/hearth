import type { PtySocket } from "../hooks/usePtySocket";

type Mods = { ctrl: boolean; alt: boolean };

type Props = {
  pty: PtySocket;
  mods: Mods;
  onToggleCtrl: () => void;
  onToggleAlt: () => void;
};

type Key =
  | { label: string; send: string; wide?: boolean }
  | { label: string; mod: "ctrl" | "alt" };

// Keys a phone keyboard hides or can't produce, plus the modifiers that make a
// terminal usable. Sticky Ctrl/Alt apply to the NEXT character you type on the
// soft keyboard (handled in Terminal's input path).
const KEYS: Key[] = [
  { label: "esc", send: "\x1b", wide: true },
  { label: "tab", send: "\t", wide: true },
  { label: "ctrl", mod: "ctrl" },
  { label: "alt", mod: "alt" },
  { label: "^C", send: "\x03" },
  { label: "/", send: "/" },
  { label: "|", send: "|" },
  { label: "~", send: "~" },
  { label: "-", send: "-" },
  { label: "↑", send: "\x1b[A" },
  { label: "↓", send: "\x1b[B" },
  { label: "←", send: "\x1b[D" },
  { label: "→", send: "\x1b[C" },
];

export default function KeyBar({ pty, mods, onToggleCtrl, onToggleAlt }: Props) {
  function press(e: React.PointerEvent, key: Key) {
    // preventDefault keeps focus on the terminal so the soft keyboard stays up
    // and sticky modifiers can apply to the next typed character.
    e.preventDefault();
    if ("mod" in key) {
      if (key.mod === "ctrl") onToggleCtrl();
      else onToggleAlt();
      return;
    }
    pty.send(key.send);
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "6px 8px",
        overflowX: "auto",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {KEYS.map((key) => {
        const active = "mod" in key && mods[key.mod];
        return (
          <button
            key={key.label}
            tabIndex={-1}
            onPointerDown={(e) => press(e, key)}
            style={{
              flex: "0 0 auto",
              minWidth: "wide" in key && key.wide ? 52 : 40,
              height: 38,
              padding: "0 10px",
              borderRadius: "var(--radius)",
              border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
              background: active ? "var(--accent-dim)" : "var(--bg)",
              color: active ? "var(--accent)" : "var(--text)",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              cursor: "pointer",
              userSelect: "none",
              touchAction: "manipulation",
            }}
          >
            {key.label}
          </button>
        );
      })}
    </div>
  );
}
