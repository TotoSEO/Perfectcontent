"use client";

import { VBT, VBT_FONT } from "@/lib/audit/brand";

// SVG-based charts. No external dep. All three are CONTAINER-RESPONSIVE:
// they fill the width they're given and keep their internal proportions via
// viewBox / flex, so they never overflow a slide box or leave dead space.

export function DonutChart({
  segments,
  size = 220,
  thickness = 36,
}: {
  segments: { label: string; value: number; color: string }[];
  // `size` is now an UPPER BOUND for the donut; it shrinks responsively
  // (min(40%, size)) so the legend always has room and nothing overflows.
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  // viewBox space is normalised to 100×100 so the SVG scales to its box.
  const VB = 100;
  const r = (VB - (thickness / size) * VB) / 2;
  const cx = VB / 2;
  const cy = VB / 2;
  const c = 2 * Math.PI * r;
  const strokeW = (thickness / size) * VB;
  let offset = 0;
  return (
    <div className="flex items-center gap-5 w-full min-w-0">
      <div
        className="shrink-0"
        style={{ width: `min(42%, ${size}px)`, aspectRatio: "1 / 1" }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="xMidYMid meet">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={VBT.paperEdge} strokeWidth={strokeW} />
          {segments.map((s, i) => {
            const dash = (s.value / total) * c;
            const seg = (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeW}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return seg;
          })}
          <text
            x={cx}
            y={cy - 1}
            textAnchor="middle"
            style={{
              fill: VBT.ink,
              fontSize: 20,
              fontWeight: 400,
              fontFamily: VBT_FONT.display,
            }}
          >
            {total.toLocaleString("fr-FR")}
          </text>
          <text
            x={cx}
            y={cy + 11}
            textAnchor="middle"
            style={{
              fill: VBT.zinc,
              fontSize: 6,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 600,
              fontFamily: VBT_FONT.mono,
            }}
          >
            URLs
          </text>
        </svg>
      </div>
      <ul className="flex-1 min-w-0 space-y-2">
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          return (
            <li key={i} className="flex items-center gap-2.5 min-w-0">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
              <span
                className="flex-1 truncate"
                style={{ color: VBT.inkSoft, fontSize: 13, fontFamily: VBT_FONT.body }}
                title={s.label}
              >
                {s.label}
              </span>
              <span
                className="tabular-nums shrink-0"
                style={{ color: VBT.ink, fontWeight: 700, fontSize: 13, fontFamily: VBT_FONT.title }}
              >
                {s.value.toLocaleString("fr-FR")}
              </span>
              <span
                className="tabular-nums shrink-0 text-right"
                style={{ color: VBT.zinc, fontSize: 11, width: 44, fontFamily: VBT_FONT.mono }}
              >
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BarChart({
  bars,
  max,
  barHeight = 26,
  gap = 8,
}: {
  bars: { label: string; value: number; color?: string }[];
  max?: number;
  // `width` is intentionally dropped — the chart fills its container.
  width?: number;
  barHeight?: number;
  gap?: number;
}) {
  const m = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="w-full min-w-0" style={{ display: "flex", flexDirection: "column", gap }}>
      {bars.map((b, i) => {
        const ratio = m > 0 ? Math.min(1, Math.max(0, b.value / m)) : 0;
        const wPct = `${ratio * 100}%`;
        const barColor = b.color || VBT.terracotta500;
        const labelInside = ratio >= 0.2;
        return (
          <div
            key={i}
            className="grid items-center gap-3 min-w-0"
            // Label column is capped + truncates; the bar takes the rest.
            style={{ gridTemplateColumns: "minmax(0, 8.5rem) 1fr" }}
          >
            <div
              className="truncate text-right"
              style={{ color: VBT.inkSoft, fontSize: 13, fontFamily: VBT_FONT.body }}
              title={b.label}
            >
              {b.label}
            </div>
            <div
              className="relative rounded-md overflow-hidden min-w-0"
              style={{ height: barHeight, background: VBT.paperEdge + "66" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-md"
                style={{
                  width: wPct,
                  background: `linear-gradient(180deg, ${barColor}EE, ${barColor})`,
                }}
              />
              <div
                className="absolute inset-y-0 flex items-center tabular-nums pointer-events-none"
                style={{
                  left: labelInside ? 10 : `calc(${wPct} + 8px)`,
                  color: labelInside ? "#FFFCF7" : VBT.ink,
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: VBT_FONT.title,
                }}
              >
                {b.value.toLocaleString("fr-FR")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Histogram({
  bins,
  height = 160,
}: {
  bins: { label: string; value: number }[];
  height?: number;
}) {
  const m = Math.max(1, ...bins.map((b) => b.value));
  return (
    <div className="w-full flex flex-col" style={{ height }}>
      <div className="flex items-end gap-1.5 w-full flex-1 min-h-0">
        {bins.map((b, i) => {
          const hPct = (b.value / m) * 100;
          const dn = parseInt(b.label.replace(/\D/g, ""), 10);
          let color: string = VBT.terracotta400;
          if (dn === 4) color = VBT.amber500;
          else if (dn >= 5) color = VBT.brick400;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0 h-full">
              <div
                className="tabular-nums shrink-0"
                style={{ fontSize: 11, fontWeight: 700, color: VBT.inkSoft, fontFamily: VBT_FONT.title }}
              >
                {b.value || ""}
              </div>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${Math.max(1.5, hPct)}%`,
                  minHeight: 2,
                  background: `linear-gradient(180deg, ${color}, ${color}DD)`,
                }}
              />
              <div
                className="uppercase tracking-wider shrink-0 truncate w-full text-center"
                style={{ fontSize: 10, fontWeight: 600, color: VBT.zinc, fontFamily: VBT_FONT.mono }}
              >
                {b.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
