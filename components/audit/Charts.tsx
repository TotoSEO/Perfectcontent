"use client";

import { VBT } from "@/lib/audit/brand";

// SVG-based charts. No external dep. Designed to look clean inside a 16:9 slide
// printed on Visibili'tea brand paper, screenshot-friendly.

export function DonutChart({
  segments,
  size = 220,
  thickness = 36,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={VBT.paperEdge} strokeWidth={thickness} />
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
              strokeWidth={thickness}
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
          y={cy - 4}
          textAnchor="middle"
          style={{
            fill: VBT.ink,
            fontSize: 30,
            fontWeight: 700,
            fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
          }}
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          style={{
            fill: VBT.zinc,
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          URLs
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="w-28" style={{ color: VBT.inkSoft }}>{s.label}</span>
            <span className="tabular-nums font-semibold" style={{ color: VBT.ink }}>{s.value}</span>
            <span className="tabular-nums text-xs" style={{ color: VBT.zinc }}>
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarChart({
  bars,
  max,
  width = 460,
  barHeight = 26,
  gap = 6,
}: {
  bars: { label: string; value: number; color?: string }[];
  max?: number;
  width?: number;
  barHeight?: number;
  gap?: number;
}) {
  const m = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="space-y-2">
      {bars.map((b, i) => {
        const w = m > 0 ? (b.value / m) * width : 0;
        const barColor = b.color || VBT.terracotta500;
        return (
          <div key={i} className="flex items-center gap-3" style={{ marginBottom: i === bars.length - 1 ? 0 : gap }}>
            <div className="w-32 text-sm text-right truncate" style={{ color: VBT.inkSoft }}>
              {b.label}
            </div>
            <div
              className="relative flex-1 rounded-md"
              style={{ height: barHeight, background: VBT.paperEdge + "55" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-all"
                style={{
                  width: w,
                  background: `linear-gradient(180deg, ${barColor}EE, ${barColor})`,
                }}
              />
              <div
                className="absolute inset-y-0 flex items-center text-sm tabular-nums font-semibold"
                style={{
                  paddingLeft: w > 30 ? 8 : Math.max(8, w + 8),
                  color: w > 30 ? "#FFFCF7" : VBT.ink,
                  left: w > 30 ? 0 : w,
                }}
              >
                {b.value}
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
    <div className="space-y-2">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {bins.map((b, i) => {
          const h = (b.value / m) * (height - 28);
          const dn = parseInt(b.label.replace(/\D/g, ""), 10);
          // Depth 0..3 = good (terracotta light), 4 = warn (amber), 5+ = bad (brick)
          let color: string = VBT.terracotta400;
          if (dn === 4) color = VBT.amber500;
          else if (dn >= 5) color = VBT.brick400;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="text-[11px] tabular-nums font-semibold" style={{ color: VBT.inkSoft }}>
                {b.value || ""}
              </div>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: Math.max(2, h),
                  background: `linear-gradient(180deg, ${color}, ${color}DD)`,
                }}
              />
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: VBT.zinc }}>
                {b.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
