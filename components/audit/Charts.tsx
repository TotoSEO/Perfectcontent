"use client";

// SVG-based charts. No external dep. Designed to look clean inside a 16:9 slide
// printed on white background, screenshot-friendly.

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
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f4f4f5" strokeWidth={thickness} />
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
            />
          );
          offset += dash;
          return seg;
        })}
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          className="fill-zinc-900"
          style={{ fontSize: 28, fontWeight: 600 }}
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          className="fill-zinc-500"
          style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}
        >
          URLs
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-zinc-700 w-24">{s.label}</span>
            <span className="tabular-nums font-medium text-zinc-900">{s.value}</span>
            <span className="tabular-nums text-zinc-400 text-xs">
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
  barHeight = 28,
  gap = 8,
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
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 text-sm text-zinc-700 text-right truncate">{b.label}</div>
            <div className="relative flex-1" style={{ height: barHeight, marginBottom: i === bars.length - 1 ? 0 : gap - 4 }}>
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-all"
                style={{
                  width: w,
                  background: b.color || "#6366f1",
                }}
              />
              <div className="absolute inset-y-0 left-2 right-0 flex items-center pl-1 text-sm font-medium tabular-nums text-zinc-800"
                   style={{ paddingLeft: Math.min(w + 8, width) }}>
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
          const h = (b.value / m) * (height - 24);
          // Tone: D0..D3 emerald, D4 amber, >=D5 red
          let color = "#10b981";
          const dn = parseInt(b.label.replace(/\D/g, ""), 10);
          if (dn === 4) color = "#f59e0b";
          else if (dn >= 5) color = "#ef4444";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="text-[11px] tabular-nums text-zinc-500">{b.value || ""}</div>
              <div className="w-full rounded-t-md transition-all" style={{ height: Math.max(2, h), background: color }} />
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">{b.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
