// Visibili'tea logo — a stylized V derived from the brand mark, drawn as
// inline SVG so it prints clean and scales to any slide size without
// shipping a binary asset.

export function VbtLogo({ size = 64, className = "" }: { size?: number; className?: string }) {
  const id = "vbt-grad";
  const idLeaf = "vbt-leaf";
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
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A55720" />
          <stop offset="55%" stopColor="#D17E47" />
          <stop offset="100%" stopColor="#E5CD83" />
        </linearGradient>
        <linearGradient id={idLeaf} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D8B962" />
          <stop offset="100%" stopColor="#C46B30" />
        </linearGradient>
      </defs>
      {/* The V */}
      <path
        d="M 14 22 L 32 22 L 48 60 L 64 22 L 82 22 L 54 84 L 42 84 Z"
        fill={`url(#${id})`}
      />
      {/* Tea leaf accents */}
      <path
        d="M 76 18 C 84 12 88 14 86 22 C 80 26 74 24 76 18 Z"
        fill={`url(#${idLeaf})`}
        opacity="0.95"
      />
      <path
        d="M 88 26 C 92 24 94 26 92 30 C 88 32 86 30 88 26 Z"
        fill="#D8B962"
      />
    </svg>
  );
}

export function VbtMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <VbtLogo size={size} />
      <span className="font-semibold tracking-tight" style={{ color: "#7E411A", fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif" }}>
        Visibili'tea
      </span>
    </span>
  );
}
