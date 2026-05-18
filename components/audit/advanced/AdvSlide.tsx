"use client";

import { ReactNode } from "react";
import { VbtLogo } from "../Logo";
import { VBT } from "@/lib/audit/brand";

/**
 * 16:9 slide for the Advanced audit deck. Same brand DNA as the classic
 * audit's Slide but with a richer header band (eyebrow + title + section
 * crumb) and tighter footer spacing. Designed for screenshot → Google Slides
 * paste at 1600×900.
 */
export function AdvSlide({
  index,
  total,
  title,
  subtitle,
  rightHeader,
  variant = "default",
  accentBand = true,
  children,
  footer,
}: {
  index: number;
  total: number;
  title?: string;
  subtitle?: string;
  rightHeader?: ReactNode;
  variant?: "default" | "cover" | "section-cover" | "reco" | "priority";
  accentBand?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const isCover = variant === "cover";
  const isSectionCover = variant === "section-cover";
  // Section covers get a warmer gradient and no title chrome in the header
  // (the title lives in the body for maximum impact).
  const bg = isCover
    ? `linear-gradient(135deg, ${VBT.paper} 0%, ${VBT.paper} 55%, ${VBT.terracotta50} 100%)`
    : isSectionCover
      ? `linear-gradient(135deg, ${VBT.terracotta50} 0%, ${VBT.paper} 40%, ${VBT.amber50} 100%)`
      : variant === "priority"
        ? `linear-gradient(135deg, ${VBT.paper} 0%, ${VBT.paper} 65%, ${VBT.amber50} 100%)`
        : VBT.paper;

  return (
    <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
      <div
        className="w-full h-full rounded-2xl overflow-hidden flex flex-col relative"
        style={{
          background: bg,
          color: VBT.ink,
          fontFamily: "var(--font-vbt-body), 'Poppins', system-ui, sans-serif",
          boxShadow: "0 24px 60px -28px rgba(36,23,18,0.45)",
          border: `1px solid ${VBT.paperEdge}`,
        }}
      >
        {accentBand && (
          <span
            aria-hidden
            className="absolute top-0 left-0 h-1.5 w-full"
            style={{
              background: `linear-gradient(90deg, ${VBT.terracotta600}, ${VBT.terracotta400}, ${VBT.amber300})`,
            }}
          />
        )}

        {!isCover && !isSectionCover && title && (
          <header className="px-12 pt-8 pb-3 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div
                className="text-[11px] uppercase tracking-[0.22em]"
                style={{ color: VBT.terracotta600, fontWeight: 600 }}
              >
                {subtitle || `Slide ${index + 1} / ${total}`}
              </div>
              <h2
                className="mt-2"
                style={{
                  fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 30,
                  letterSpacing: "-0.015em",
                  color: VBT.ink,
                  lineHeight: 1.1,
                  // Allow up to 2 lines instead of truncating — long titles
                  // like "Pages sans / avec peu de liens entrants" need this.
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                }}
              >
                {title}
              </h2>
            </div>
            <div className="shrink-0 flex items-center gap-3">
              {rightHeader}
              <VbtLogo size={32} />
            </div>
          </header>
        )}

        {/* Body */}
        <main
          className={`flex-1 ${isCover ? "px-14 py-10" : isSectionCover ? "px-14 py-12" : "px-12 pb-4"} min-h-0 flex flex-col`}
        >
          {children}
        </main>

        <footer
          className="px-12 py-3 flex items-center justify-between text-[11px]"
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
            <span>{footer || "Audit technique avancé SEO"}</span>
          </div>
          <div className="tabular-nums">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Coloured pill used to badge a sub-id / section etc. */
export function SectionPill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warn" | "ok" | "bad" }) {
  const palette =
    tone === "ok" ? { bg: "#EAF2E0", text: VBT.good, border: "#C6D9B0" } :
    tone === "warn" ? { bg: VBT.amber50, text: VBT.amber600, border: "#E5CD83" } :
    tone === "bad" ? { bg: VBT.brick50, text: VBT.brick500, border: "#E5BDB5" } :
    { bg: VBT.terracotta50, text: VBT.terracotta700, border: "#F5D5BA" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: palette.bg, color: palette.text, border: `1px solid ${palette.border}` }}
    >
      {children}
    </span>
  );
}
