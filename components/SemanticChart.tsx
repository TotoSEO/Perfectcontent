"use client";

import { useMemo, useState, useCallback } from "react";

/**
 * Live YourTextGuru-style optimization chart.
 *
 * X axis : the top-N BM25 terms ordered by importance (left = most important).
 * Y axis : current count of each term in the user's text, normalized so each
 *          term's "good" target sits at the same horizontal band on screen
 *          (we plot count / target rather than raw count — otherwise a few
 *          high-frequency terms would stretch the Y axis and the rest of
 *          the curve would flatten).
 * Bands  : 4 horizontal coloured zones — under-opti / good / over-opti /
 *          danger. Computed in target-multiples so they stay constant
 *          across the chart.
 *
 *   ratio = count / target
 *   under  : ratio < 0.5
 *   good   : 0.5 ≤ ratio ≤ 1.5
 *   over   : 1.5 < ratio ≤ 3
 *   danger : ratio > 3
 *
 * The line is drawn as a smoothed (Catmull-Rom-ish) path with circles at
 * each data point; hovering reveals a labelled tooltip.
 */

export type Term = {
  term: string;
  target: number;
  min: number;
  max: number;
  importance: number;
  is_ngram?: boolean;
  surface_forms?: string[];
};

export type TermStat = Term & {
  count: number;
  ratio: number; // count / max(0.5, target)
  status: "missing" | "low" | "ok" | "over" | "danger";
};

type Props = {
  stats: TermStat[];
  height?: number;
};

const BAND_TONES = {
  under: { fill: "rgba(239, 68, 68, 0.08)", border: "rgba(239,68,68,0.18)" },
  good:  { fill: "rgba(16, 185, 129, 0.10)", border: "rgba(16,185,129,0.20)" },
  over:  { fill: "rgba(245, 158, 11, 0.10)", border: "rgba(245,158,11,0.22)" },
  danger:{ fill: "rgba(239, 68, 68, 0.16)", border: "rgba(239,68,68,0.30)" },
};

const STATUS_COLOR: Record<TermStat["status"], string> = {
  missing: "#ef4444",
  low: "#f59e0b",
  ok: "#10b981",
  over: "#f97316",
  danger: "#ef4444",
};

// Y axis is in target-multiples. Bands sit at fixed multiples regardless of
// the term's absolute target, so visually 1.0× is always at the same
// vertical position.
const Y_MAX = 4.0;          // top of chart = 4× target
const Y_GOOD_LOW = 0.5;
const Y_GOOD_HIGH = 1.5;
const Y_OVER_HIGH = 3.0;

export function SemanticChart({ stats, height = 360 }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 1000;            // viewBox width — scales with container
  const H = height;
  const PAD_L = 36;
  const PAD_R = 16;
  const PAD_T = 14;
  const PAD_B = 70;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const yFor = useCallback(
    (ratio: number) => {
      const r = Math.min(Y_MAX, Math.max(0, ratio));
      return PAD_T + innerH * (1 - r / Y_MAX);
    },
    [innerH],
  );

  const xFor = useCallback(
    (i: number, n: number) => {
      if (n <= 1) return PAD_L + innerW / 2;
      return PAD_L + (i / (n - 1)) * innerW;
    },
    [innerW],
  );

  // Curve through points using Catmull-Rom → Bézier
  const path = useMemo(() => {
    if (stats.length === 0) return "";
    const pts = stats.map((s, i) => [xFor(i, stats.length), yFor(s.ratio)] as const);
    if (pts.length === 1) {
      const [x, y] = pts[0];
      return `M ${x} ${y}`;
    }
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }, [stats, xFor, yFor]);

  // Area path under the curve, for the fill
  const areaPath = useMemo(() => {
    if (!path || stats.length === 0) return "";
    const lastX = xFor(stats.length - 1, stats.length);
    const firstX = xFor(0, stats.length);
    const baseY = yFor(0);
    return `${path} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [path, stats, xFor, yFor]);

  if (stats.length === 0) {
    return (
      <div
        className="card p-12 text-center text-sm text-zinc-500"
        style={{ minHeight: height }}
      >
        Lance l'analyse SERP pour générer les termes cibles.
      </div>
    );
  }

  const yUnderTop = yFor(Y_GOOD_LOW);
  const yGoodTop = yFor(Y_GOOD_HIGH);
  const yOverTop = yFor(Y_OVER_HIGH);
  const yChartTop = yFor(Y_MAX);
  const yChartBot = yFor(0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        style={{ maxHeight: height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lineGrad" x1="0" x2="1">
            <stop offset="0" stopColor="#7c84ff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7c84ff" stopOpacity="0.34" />
            <stop offset="1" stopColor="#7c84ff" stopOpacity="0" />
          </linearGradient>
          <filter id="lineGlow" x="-2%" y="-50%" width="104%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bands */}
        <rect
          x={PAD_L}
          y={yChartTop}
          width={innerW}
          height={yOverTop - yChartTop}
          fill={BAND_TONES.danger.fill}
        />
        <rect
          x={PAD_L}
          y={yOverTop}
          width={innerW}
          height={yGoodTop - yOverTop}
          fill={BAND_TONES.over.fill}
        />
        <rect
          x={PAD_L}
          y={yGoodTop}
          width={innerW}
          height={yUnderTop - yGoodTop}
          fill={BAND_TONES.good.fill}
        />
        <rect
          x={PAD_L}
          y={yUnderTop}
          width={innerW}
          height={yChartBot - yUnderTop}
          fill={BAND_TONES.under.fill}
        />

        {/* Band borders */}
        {[
          { y: yOverTop, t: BAND_TONES.danger.border },
          { y: yGoodTop, t: BAND_TONES.over.border },
          { y: yUnderTop, t: BAND_TONES.good.border },
        ].map((b, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={b.y} y2={b.y} stroke={b.t} strokeDasharray="3 3" />
        ))}

        {/* Y axis labels */}
        {[
          { y: yChartTop, label: "4×" },
          { y: yOverTop, label: "3×" },
          { y: yGoodTop, label: "1.5×" },
          { y: yFor(1), label: "cible" },
          { y: yUnderTop, label: "0.5×" },
          { y: yChartBot, label: "0" },
        ].map((m, i) => (
          <text
            key={i}
            x={PAD_L - 6}
            y={m.y + 3}
            textAnchor="end"
            fontSize={9.5}
            fill="rgba(255,255,255,0.45)"
          >
            {m.label}
          </text>
        ))}

        {/* Band side labels (right edge) */}
        {[
          { y: (yChartTop + yOverTop) / 2, label: "DANGER", color: "rgba(252,165,165,0.6)" },
          { y: (yOverTop + yGoodTop) / 2, label: "SUR-OPTI", color: "rgba(252,211,77,0.7)" },
          { y: (yGoodTop + yUnderTop) / 2, label: "BONNE OPTI", color: "rgba(110,231,183,0.7)" },
          { y: (yUnderTop + yChartBot) / 2, label: "SOUS-OPTI", color: "rgba(252,165,165,0.55)" },
        ].map((b, i) => (
          <text
            key={i}
            x={W - PAD_R - 6}
            y={b.y + 3}
            textAnchor="end"
            fontSize={9}
            letterSpacing="1.5"
            fill={b.color}
            fontWeight={600}
          >
            {b.label}
          </text>
        ))}

        {/* Area fill under the curve */}
        {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

        {/* The curve itself, with a subtle glow */}
        {path && (
          <>
            <path
              d={path}
              fill="none"
              stroke="url(#lineGrad)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#lineGlow)"
            />
            <path
              d={path}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {/* Vertical hover line */}
        {hover !== null && (
          <line
            x1={xFor(hover, stats.length)}
            x2={xFor(hover, stats.length)}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
          />
        )}

        {/* Data points */}
        {stats.map((s, i) => {
          const x = xFor(i, stats.length);
          const y = yFor(s.ratio);
          const isHover = hover === i;
          return (
            <g
              key={s.term}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              style={{ cursor: "default" }}
            >
              {/* Wide invisible hit box covering full column */}
              <rect
                x={x - innerW / (stats.length * 2)}
                y={PAD_T}
                width={Math.max(8, innerW / stats.length)}
                height={H - PAD_T - PAD_B}
                fill="transparent"
              />
              <circle
                cx={x}
                cy={y}
                r={isHover ? 4.5 : 2.6}
                fill={STATUS_COLOR[s.status]}
                stroke="#0a0b10"
                strokeWidth={isHover ? 1.8 : 1.4}
                style={{ transition: "r 160ms ease, opacity 160ms" }}
              />
            </g>
          );
        })}

        {/* X axis labels — alternate top/bottom to avoid overlap */}
        {stats.map((s, i) => {
          const x = xFor(i, stats.length);
          const isHover = hover === i;
          // Show every-other label by default to keep readability; on hover
          // always show the hovered one. Show first + last always.
          const visible =
            isHover ||
            i === 0 ||
            i === stats.length - 1 ||
            i % 2 === 0;
          if (!visible) return null;
          return (
            <g
              key={`lbl-${s.term}`}
              transform={`translate(${x} ${H - PAD_B + 14}) rotate(-42)`}
              opacity={isHover ? 1 : 0.65}
            >
              <text
                fontSize={isHover ? 11 : 10}
                fill={isHover ? "#ffffff" : "rgba(255,255,255,0.7)"}
                textAnchor="end"
                fontWeight={isHover ? 600 : 400}
              >
                {truncate(s.term, 16)}
              </text>
            </g>
          );
        })}

        {/* Tooltip on hover */}
        {hover !== null && (() => {
          const s = stats[hover];
          const x = xFor(hover, stats.length);
          const y = yFor(s.ratio);
          // Tooltip box positioning, clamp inside chart
          const w = 200;
          const h = 78;
          let tx = x + 14;
          if (tx + w > W - PAD_R) tx = x - w - 14;
          let ty = y - h / 2;
          if (ty < PAD_T) ty = PAD_T;
          if (ty + h > H - PAD_B - 4) ty = H - PAD_B - 4 - h;
          return (
            <g pointerEvents="none">
              <rect
                x={tx}
                y={ty}
                width={w}
                height={h}
                rx={8}
                fill="rgba(14,16,24,0.95)"
                stroke="rgba(255,255,255,0.14)"
              />
              <text x={tx + 12} y={ty + 18} fontSize={12} fontWeight={600} fill="#fff">
                {truncate(s.term, 22)}
              </text>
              <text x={tx + 12} y={ty + 36} fontSize={11} fill="rgba(255,255,255,0.7)">
                Compte : <tspan fill="#fff" fontWeight={600}>{s.count}</tspan>
                <tspan dx={6}>/ cible {Math.max(1, Math.round(s.target))}</tspan>
              </text>
              <text x={tx + 12} y={ty + 52} fontSize={10.5} fill="rgba(255,255,255,0.55)">
                Plage : {s.min}–{s.max}
              </text>
              <text x={tx + 12} y={ty + 67} fontSize={10.5} fill={STATUS_COLOR[s.status]} fontWeight={600}>
                {STATUS_LABEL[s.status]}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

const STATUS_LABEL: Record<TermStat["status"], string> = {
  missing: "À AJOUTER",
  low: "SOUS-OPTIMISÉ",
  ok: "BONNE OPTI",
  over: "SUR-OPTIMISÉ",
  danger: "DANGER",
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* -------------------------- Score helpers -------------------------- */

/** Compute per-term stats from the targets + count map. Counts come from
 *  the tokenizer (see lib/stopwords.ts). */
export function computeStats(
  targets: Term[],
  counts: Map<string, number>,
): TermStat[] {
  return targets.map((t) => {
    let count = 0;
    const surfaces = t.surface_forms?.length ? t.surface_forms : [t.term];
    for (const s of surfaces) {
      count += counts.get(s.toLowerCase()) || 0;
    }
    const target = Math.max(0.5, t.target);
    const ratio = count / target;
    let status: TermStat["status"] = "ok";
    if (count === 0) status = "missing";
    else if (count < t.min) status = "low";
    else if (count > t.max && ratio <= 3) status = "over";
    else if (ratio > 3) status = "danger";
    else if (count <= t.max) status = "ok";
    return { ...t, count, ratio, status };
  });
}

/** Optimization score 0-120 (target = 100). Each term contributes
 *  proportionally to its importance × min(1, count/target), capped at 1.2 to
 *  avoid over-weighting over-optimized terms. */
export function optimizationScore(stats: TermStat[]): number {
  if (stats.length === 0) return 0;
  let totalImp = 0;
  let acc = 0;
  for (const s of stats) {
    const imp = s.importance || 1 / stats.length;
    totalImp += imp;
    const target = Math.max(0.5, s.target);
    const r = Math.min(1.2, s.count / target);
    acc += imp * r;
  }
  return Math.round((acc / totalImp) * 100);
}

/** Danger score 0-100. Penalty grows with the square of how far above max
 *  each term is, weighted by importance. 0 = no over-use; 100 = catastrophic. */
export function dangerScore(stats: TermStat[]): number {
  if (stats.length === 0) return 0;
  let totalImp = 0;
  let acc = 0;
  for (const s of stats) {
    const imp = s.importance || 1 / stats.length;
    totalImp += imp;
    if (s.count <= s.max) continue;
    const overshoot = s.count - s.max;
    const denom = Math.max(1, s.max);
    const x = overshoot / denom;       // 0 at the max threshold, 1 = 2× max
    const pen = Math.min(1, x * x);    // saturating quadratic
    acc += imp * pen;
  }
  return Math.round((acc / totalImp) * 100);
}
