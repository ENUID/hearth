import { useId } from "react";

// The Hearth mark — a minimal terminal window with an ember prompt. A rounded
// window frame, a hairline title rail, a ">" caret and a lit cursor: the web
// terminal, distilled to one glyph. Ember gradient by default; pass `mono` for
// a single-colour rendering (watermarks).
type Props = {
  size?: number;
  /** Ember drop-shadow glow around the mark (hero placements). */
  glow?: boolean;
  /** Single-color rendering (watermarks); overrides the gradient. */
  mono?: string;
  style?: React.CSSProperties;
};

export default function HearthMark({ size = 20, glow = false, mono, style }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const stroke = mono ?? `url(#${id})`;
  const cursor = mono ?? "#ffb454";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={glow ? { filter: "drop-shadow(0 0 14px var(--accent-glow))", ...style } : style}
    >
      {!mono && (
        <defs>
          <linearGradient id={id} x1="6" y1="40" x2="42" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff5f2e" />
            <stop offset="0.55" stopColor="#ff7a45" />
            <stop offset="1" stopColor="#ffb454" />
          </linearGradient>
        </defs>
      )}
      <rect x="8" y="10.5" width="32" height="27" rx="7.5" stroke={stroke} strokeWidth="3" />
      <path d="M8.6 17.5 H39.4" stroke={stroke} strokeWidth="2" opacity="0.45" />
      <path d="M16 23 L21.5 27 L16 31" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="24.5" y="29" width="8.5" height="2.8" rx="1.4" fill={cursor} />
    </svg>
  );
}
