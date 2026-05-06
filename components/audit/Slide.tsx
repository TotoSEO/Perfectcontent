"use client";

import { ReactNode } from "react";

/**
 * Fixed-aspect 16:9 slide. Designed to be screenshot-ready: when the user
 * captures a slide and pastes it into Google Slides, it should look clean
 * with no UI chrome around it.
 *
 * The slide content is sized to a 1600×900 design canvas; CSS scales it
 * down responsively while preserving the ratio.
 */
export function Slide({
  index,
  total,
  title,
  subtitle,
  rightHeader,
  children,
  footer,
}: {
  index: number;
  total: number;
  title: string;
  subtitle?: string;
  rightHeader?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
      <div className="w-full h-full bg-white text-zinc-900 rounded-2xl shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col"
           style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        {/* Slide top bar */}
        <header className="px-10 pt-8 pb-4 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {subtitle || `Slide ${index + 1} / ${total}`}
            </div>
            <h2 className="text-3xl font-semibold mt-1.5 tracking-tight text-zinc-900 truncate">
              {title}
            </h2>
          </div>
          <div className="shrink-0">{rightHeader}</div>
        </header>

        {/* Body */}
        <main className="flex-1 px-10 min-h-0 flex flex-col">
          {children}
        </main>

        {/* Footer */}
        <footer className="px-10 py-4 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400">
          <div>{footer}</div>
          <div className="tabular-nums">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80 ? { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" } :
    score >= 50 ? { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200" } :
                  { bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200" };
  return (
    <div className={`text-center px-4 py-2 rounded-xl border ${tone.bg} ${tone.border}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Score</div>
      <div className={`text-2xl font-semibold tabular-nums ${tone.text}`}>{score}<span className="text-sm text-zinc-400">/100</span></div>
    </div>
  );
}

export function KpiTile({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "bad";
}) {
  const colors =
    tone === "bad"  ? "bg-red-50 text-red-600 border-red-200" :
    tone === "warn" ? "bg-amber-50 text-amber-600 border-amber-200" :
                      "bg-emerald-50 text-emerald-600 border-emerald-200";
  return (
    <div className={`px-3 py-2.5 rounded-lg border ${colors}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
