"use client";

import { VBT, VBT_FONT } from "@/lib/audit/brand";

/**
 * Responsive radar (spider) chart in SVG. Fills its container while
 * preserving aspect ratio via viewBox. Axes labels sit at fixed angular
 * positions and gracefully wrap on two lines so a long category label never
 * pushes outside the box. Up to 12 axes are supported cleanly.
 */
export function RadarChart({
  axes,
  // 0..100 score per axis (same order as `axes`).
  series,
  // Slightly larger numbers print better when this gets baked into a PDF.
  // The chart fills its container; this is just the design viewBox.
  size = 480,
}: {
  axes: string[];
  series: number[];
  size?: number;
}) {
  const N = axes.length;
  if (N < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  // Leave room for outside labels (≈ 22% of the half-extent each side).
  const r = (size / 2) * 0.62;

  // Angles : -90deg start (top) then clockwise.
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;

  // Concentric rings (gridlines at 25 / 50 / 75 / 100).
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Series polygon points
  const polyPts = series
    .map((v, i) => {
      const ratio = Math.max(0, Math.min(1, v / 100));
      const a = angle(i);
      const x = cx + Math.cos(a) * r * ratio;
      const y = cy + Math.sin(a) * r * ratio;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Gridline polygon for a given ratio
  const ringPts = (ratio: number) =>
    Array.from({ length: N }, (_, i) => {
      const a = angle(i);
      return `${(cx + Math.cos(a) * r * ratio).toFixed(1)},${(cy + Math.sin(a) * r * ratio).toFixed(1)}`;
    }).join(" ");

  return (
    <div className="w-full h-full flex items-center justify-center min-w-0 min-h-0">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        style={{ overflow: "visible" }}
      >
        {/* gridlines (octagonal rings) */}
        {rings.map((ratio, ri) => (
          <polygon
            key={ri}
            points={ringPts(ratio)}
            fill="none"
            stroke={VBT.paperEdge}
            strokeWidth={ri === rings.length - 1 ? 1.4 : 1}
          />
        ))}
        {/* spokes */}
        {axes.map((_, i) => {
          const a = angle(i);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + Math.cos(a) * r}
              y2={cy + Math.sin(a) * r}
              stroke={VBT.paperEdge}
              strokeWidth={1}
            />
          );
        })}
        {/* ring labels (25 / 50 / 100) at the top spoke */}
        {[25, 50, 100].map((v) => {
          const ratio = v / 100;
          return (
            <text
              key={v}
              x={cx + 4}
              y={cy - r * ratio - 2}
              style={{
                fill: VBT.zinc,
                fontSize: 9,
                fontFamily: VBT_FONT.mono,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              {v}
            </text>
          );
        })}

        {/* series fill + stroke */}
        <polygon points={polyPts} fill={VBT.terracotta500} fillOpacity="0.18" />
        <polygon points={polyPts} fill="none" stroke={VBT.terracotta600} strokeWidth={2} strokeLinejoin="round" />
        {/* series points */}
        {series.map((v, i) => {
          const ratio = Math.max(0, Math.min(1, v / 100));
          const a = angle(i);
          const x = cx + Math.cos(a) * r * ratio;
          const y = cy + Math.sin(a) * r * ratio;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3.5}
              fill={VBT.terracotta600}
              stroke={VBT.paper}
              strokeWidth={1.5}
            />
          );
        })}

        {/* axis labels (outside the ring, two-line wrap if needed) */}
        {axes.map((label, i) => {
          const a = angle(i);
          const labelR = r + 18;
          const x = cx + Math.cos(a) * labelR;
          const y = cy + Math.sin(a) * labelR;
          // Anchor based on quadrant so labels never cross the chart.
          const cosA = Math.cos(a);
          const anchor =
            Math.abs(cosA) < 0.15 ? "middle" :
            cosA > 0 ? "start" : "end";
          // Two-line split for long labels
          const words = label.split(" ");
          const split = words.length > 2 && label.length > 14 ? Math.ceil(words.length / 2) : -1;
          const l1 = split > 0 ? words.slice(0, split).join(" ") : label;
          const l2 = split > 0 ? words.slice(split).join(" ") : "";
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={anchor}
              style={{
                fill: VBT.ink,
                fontSize: 12,
                fontFamily: VBT_FONT.title,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              <tspan x={x} dy={l2 ? -6 : 4}>{l1}</tspan>
              {l2 && (
                <tspan x={x} dy={13}>{l2}</tspan>
              )}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
