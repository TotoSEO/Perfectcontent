"use client";

import { ReactNode } from "react";
import { VbtLogo } from "./Logo";
import { VBT } from "@/lib/audit/brand";

/**
 * Visibili'tea-branded 16:9 slide. Designed to be screenshot-ready: when the
 * user captures a slide and pastes it into Google Slides, it should look
 * native to the brand (Montserrat title, Poppins body, terracotta accents).
 *
 * The slide content is sized to a 1600×900 design canvas; CSS scales it down
 * responsively while preserving the ratio.
 */
export function Slide({
  index,
  total,
  title,
  subtitle,
  rightHeader,
  children,
  footer,
  variant = "default",
}: {
  index: number;
  total: number;
  title: string;
  subtitle?: string;
  rightHeader?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "cover";
}) {
  const isCover = variant === "cover";
  return (
    <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
      <div
        className="w-full h-full rounded-2xl overflow-hidden flex flex-col relative"
        style={{
          background: isCover
            ? `linear-gradient(135deg, ${VBT.paper} 0%, ${VBT.paper} 60%, ${VBT.terracotta50} 100%)`
            : VBT.paper,
          color: VBT.ink,
          fontFamily: "var(--font-vbt-body), 'Poppins', system-ui, sans-serif",
          boxShadow: "0 24px 60px -28px rgba(36,23,18,0.45)",
          border: `1px solid ${VBT.paperEdge}`,
        }}
      >
        {/* Decorative corner band on every slide */}
        <span
          aria-hidden
          className="absolute top-0 left-0 h-1.5 w-full"
          style={{
            background: `linear-gradient(90deg, ${VBT.terracotta600}, ${VBT.terracotta400}, ${VBT.amber300})`,
          }}
        />

        {!isCover && (
          <header className="px-12 pt-9 pb-4 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div
                className="text-[11px] uppercase tracking-[0.22em]"
                style={{ color: VBT.terracotta600, fontWeight: 600 }}
              >
                {subtitle || `Slide ${index + 1} / ${total}`}
              </div>
              <h2
                className="mt-2 truncate"
                style={{
                  fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 36,
                  letterSpacing: "-0.015em",
                  color: VBT.ink,
                }}
              >
                {title}
              </h2>
            </div>
            <div className="shrink-0 flex items-center gap-3">
              {rightHeader}
              <VbtLogo size={36} />
            </div>
          </header>
        )}

        {/* Body */}
        <main className={`flex-1 ${isCover ? "px-14 py-10" : "px-12"} min-h-0 flex flex-col`}>
          {children}
        </main>

        {/* Footer */}
        <footer
          className="px-12 py-3.5 flex items-center justify-between text-[11px]"
          style={{ color: VBT.zinc, borderTop: `1px solid ${VBT.paperEdge}` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="font-semibold"
              style={{
                fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                color: VBT.terracotta600,
                letterSpacing: "0.02em",
              }}
            >
              Visibili'tea
            </span>
            <span style={{ color: VBT.paperEdge }}>·</span>
            <span>{footer || "Audit technique SEO"}</span>
          </div>
          <div className="tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? { bg: "#EAF2E0", text: VBT.good, border: "#C6D9B0" }
      : score >= 50
      ? { bg: VBT.amber50, text: VBT.amber600, border: "#E5CD83" }
      : { bg: VBT.brick50, text: VBT.brick500, border: "#E5BDB5" };
  return (
    <div
      className="text-center px-4 py-2 rounded-xl border"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: VBT.zinc, fontWeight: 600 }}
      >
        Score
      </div>
      <div
        className="text-2xl tabular-nums"
        style={{
          color: tone.text,
          fontWeight: 700,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
        }}
      >
        {score}
        <span className="text-sm" style={{ color: VBT.zinc, fontWeight: 500 }}>
          /100
        </span>
      </div>
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
  const palette =
    tone === "bad"
      ? { bg: VBT.brick50, text: VBT.brick500, border: "#E5BDB5" }
      : tone === "warn"
      ? { bg: VBT.amber50, text: VBT.amber600, border: "#E5CD83" }
      : { bg: "#EAF2E0", text: VBT.good, border: "#C6D9B0" };
  return (
    <div
      className="px-3.5 py-2.5 rounded-xl border"
      style={{ background: palette.bg, borderColor: palette.border }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.14em]"
        style={{ color: VBT.zinc, fontWeight: 600 }}
      >
        {label}
      </div>
      <div
        className="text-xl tabular-nums mt-0.5"
        style={{
          color: palette.text,
          fontWeight: 700,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
        }}
      >
        {value}
      </div>
    </div>
  );
}
