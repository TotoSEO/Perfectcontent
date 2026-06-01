// Visibili'tea brand mark + wordmark.
// Drawn as inline SVG with the brand gradient so it scales cleanly to any
// slide size and prints crisp without shipping a binary asset.

export function VbtMarkOnly({ size = 64, className = "" }: { size?: number; className?: string }) {
  // A small "tea leaf with steam curl" mark : clean, on-brand, neutral
  // enough to drop in the corner of any slide without competing with the
  // wordmark.
  const id = `vbt-leaf-${Math.random().toString(36).slice(2, 7)}`;
  const idSteam = `${id}-steam`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7E411A" />
          <stop offset="55%" stopColor="#C46B30" />
          <stop offset="100%" stopColor="#D8B962" />
        </linearGradient>
        <linearGradient id={idSteam} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#C46B30" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#D8B962" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* Tea leaf */}
      <path
        d="M 22 64
           C 22 38, 44 22, 74 22
           C 74 52, 52 70, 22 64 Z"
        fill={`url(#${id})`}
      />
      {/* Inner vein on the leaf */}
      <path
        d="M 30 60 C 42 50, 58 38, 70 28"
        fill="none"
        stroke="#FFFCF7"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Two stylised steam curls rising from above the leaf */}
      <path
        d="M 56 18 C 60 14, 56 10, 60 6"
        fill="none"
        stroke={`url(#${idSteam})`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 68 16 C 72 12, 68 8, 72 4"
        fill="none"
        stroke={`url(#${idSteam})`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wordmark "Visibili'tea" in Montserrat with a brand-tinted accent on the
 *  apostrophe-tea suffix. This is what appears on slide footers and the cover.
 */
export function VbtWordmark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-baseline ${className}`}
      style={{
        fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.015em",
        lineHeight: 1,
      }}
    >
      <span style={{ color: "#7E411A" }}>Visibili</span>
      <span style={{ color: "#C46B30" }}>&#39;</span>
      <span style={{ color: "#A55720" }}>tea</span>
    </span>
  );
}

/** Compact horizontal logo: small leaf mark + wordmark. Used on slide
 *  headers / corners. */
export function VbtLogo({
  size = 48,
  className = "",
  layout = "horizontal",
}: {
  size?: number;
  className?: string;
  layout?: "horizontal" | "stack" | "mark";
}) {
  if (layout === "mark") {
    return <VbtMarkOnly size={size} className={className} />;
  }
  if (layout === "stack") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <VbtMarkOnly size={size} />
        <VbtWordmark size={Math.round(size * 0.42)} />
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <VbtMarkOnly size={size} />
      <VbtWordmark size={Math.round(size * 0.45)} />
    </div>
  );
}
