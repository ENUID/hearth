import { useId } from "react";

// The Hearth mark — "the burning cursor". A terminal block cursor whose top
// edge burns into two flame tongues, an underscore prompt cut into its base,
// and pixel-square sparks rising like embers. Terminal + fire in one shape.
export const MARK_PATH =
  "M15.4 42 Q12 42 12 38.6 L12 22.4 " +
  "C12 19.4 12.7 17.5 14.3 15.8 C14.4 12.4 15.3 10.2 17.1 8 " +
  "C17.9 11 19 13.6 20.8 15.9 C23.5 12.6 25.7 7.6 25.3 2.4 " +
  "C29 6.2 31.3 11.4 31.7 15.4 C34.4 16.8 36 18.7 36 21.8 " +
  "L36 38.6 Q36 42 32.6 42 Z " +
  // the underscore prompt, cut out of the block (fill-rule: evenodd)
  "M18.6 33.2 Q17 33.2 17 34.8 L17 35.2 Q17 36.8 18.6 36.8 " +
  "L29.4 36.8 Q31 36.8 31 35.2 L31 34.8 Q31 33.2 29.4 33.2 Z";

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
  const fill = mono ?? `url(#${id})`;
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
          <linearGradient id={id} x1="0" y1="44" x2="0" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff5f2e" />
            <stop offset="0.45" stopColor="#ff7a45" />
            <stop offset="1" stopColor="#ffb454" />
          </linearGradient>
        </defs>
      )}
      <path fill={fill} fillRule="evenodd" d={MARK_PATH} />
      <rect x="38.6" y="7.6" width="4.4" height="4.4" rx="1.3" fill={mono ?? "#ffb454"} opacity="0.9" />
      <rect x="43.2" y="2.2" width="2.9" height="2.9" rx="0.9" fill={mono ?? "#ffb454"} opacity="0.55" />
    </svg>
  );
}
