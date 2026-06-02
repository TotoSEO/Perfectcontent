"use client";

import { VBT, VBT_TYPO, VBT_FONT, hardShadow } from "@/lib/audit/brand";

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
          stroke={VBT.cream200}
          strokeWidth={thickness}
        />
        {/* ink outer + inner hairlines : frames the ring (DS look) */}
        <circle cx={center} cy={center} r={radius + thickness / 2} fill="none" stroke={VBT.ink} strokeWidth={1.5} />
        <circle cx={center} cy={center} r={radius - thickness / 2} fill="none" stroke={VBT.ink} strokeWidth={1.5} />
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
            fontFamily: VBT_FONT.display,
            fontWeight: 800,
            fontSize: Math.round(size * 0.4),
            letterSpacing: "-0.02em",
            lineHeight: 0.95,
          }}
        >
          {clamped}
        </div>
        <div
          className="inline-flex items-center"
          style={{
            color: VBT.ink,
            background: VBT.cream100,
            border: `1.5px solid ${VBT.ink}`,
            borderRadius: 999,
            boxShadow: hardShadow(2),
            padding: "4px 12px",
            fontWeight: 800,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginTop: 10,
            fontFamily: VBT_FONT.title,
          }}
        >
          {label || "Score / 100"}
        </div>
      </div>
    </div>
  );
}
