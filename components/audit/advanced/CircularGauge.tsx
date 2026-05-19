"use client";

import { VBT, VBT_TYPO } from "@/lib/audit/brand";

/**
 * Circular gauge used on the cover slide (4.12). The score sits at the
 * center in hero typography (120+ px); the ring fills proportionally to
 * the score with a color that shifts from red → orange → green.
 */
export function CircularGauge({
  score,
  size = 320,
  thickness = 18,
  label,
}: {
  score: number;
  size?: number;
  thickness?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  // Pick a status color based on score thresholds.
  const ringColor =
    clamped >= 80 ? VBT.sigGreen :
    clamped >= 50 ? VBT.sigOrange :
    VBT.sigRed;
  const scoreColor = ringColor;
  const center = size / 2;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={`gaugeGrad-${clamped}-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={ringColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={ringColor} />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={VBT.paperEdge}
          strokeWidth={thickness}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#gaugeGrad-${clamped}-${size})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div
          className="tabular-nums"
          style={{
            color: scoreColor,
            fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: Math.round(size * 0.42),
            letterSpacing: "-0.045em",
            lineHeight: 0.95,
          }}
        >
          {clamped}
        </div>
        <div
          style={{
            color: VBT.zinc,
            fontWeight: 600,
            fontSize: VBT_TYPO.caption,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          {label || "Score / 100"}
        </div>
      </div>
    </div>
  );
}
