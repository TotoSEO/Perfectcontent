"use client";

import { ReactNode } from "react";
import { VBT, VBT_TYPO } from "@/lib/audit/brand";

/**
 * 16:9 slide for the Advanced audit deck. Authored against a 1600×900
 * canvas, with the brand DNA from the classic audit. Header uses a single
 * lockup with eyebrow + title; logo + branding only appear once per
 * slide (in the footer), per the design refactor.
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
  const bg = isCover
    ? `linear-gradient(135deg, ${VBT.paper} 0%, ${VBT.paper} 55%, ${VBT.terracotta50} 100%)`
    : isSectionCover
      ? `linear-gradient(135deg, ${VBT.terracotta50} 0%, ${VBT.paper} 40%, ${VBT.amber50} 100%)`
      : variant === "priority"
        ? `linear-gradient(135deg, ${VBT.paper} 0%, ${VBT.paper} 65%, ${VBT.amber50} 100%)`
        : VBT.paper;

  // Generous horizontal padding for breathing room (4.14). Cover and
  // section-cover get the full 80 px; data slides get 64 px so charts
  // can be wider without feeling cramped.
  const padX = isCover || isSectionCover ? 80 : 64;
  const headerPadTop = 36;
  const headerPadBottom = 18;

  return (
    <div className="w-full" style={{ aspectRatio: "16 / 9" }} data-pdf-slide>
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
          <header
            className="flex items-start justify-between gap-8"
            style={{
              padding: `${headerPadTop}px ${padX}px ${headerPadBottom}px`,
            }}
          >
            <div className="min-w-0 flex-1">
              <div
                className="uppercase"
                style={{
                  color: VBT.terracotta600,
                  fontWeight: 700,
                  fontSize: VBT_TYPO.micro,
                  letterSpacing: "0.24em",
                }}
              >
                {subtitle || `Slide ${index + 1} / ${total}`}
              </div>
              <h2
                className="mt-2.5"
                style={{
                  fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: VBT_TYPO.pageTitle,
                  letterSpacing: "-0.02em",
                  color: VBT.ink,
                  lineHeight: 1.1,
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
            {rightHeader && (
              <div className="shrink-0 flex items-center gap-3 pt-1">
                {rightHeader}
              </div>
            )}
          </header>
        )}

        <main
          className="flex-1 min-h-0 flex flex-col"
          style={{
            paddingLeft: padX,
            paddingRight: padX,
            paddingTop: isCover ? 64 : isSectionCover ? 56 : 8,
            paddingBottom: isCover ? 40 : isSectionCover ? 56 : 20,
          }}
        >
          {children}
        </main>

        {/* Single brand lockup (4.5) — Visibili'tea + slide N/M in the
            footer only. No duplicate logo in headers. */}
        <footer
          className="flex items-center justify-between"
          style={{
            padding: `12px ${padX}px`,
            fontSize: VBT_TYPO.caption,
            color: VBT.zinc,
            borderTop: `1px solid ${VBT.paperEdge}`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{
                width: 6,
                height: 6,
                background: VBT.terracotta500,
              }}
            />
            <span
              className="font-semibold"
              style={{
                fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                color: VBT.terracotta600,
                letterSpacing: "0.04em",
                fontSize: VBT_TYPO.caption,
              }}
            >
              Visibili&apos;tea
            </span>
            <span style={{ color: VBT.paperEdge }}>·</span>
            <span>{footer || "Audit technique avancé SEO"}</span>
          </div>
          <div
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
              fontWeight: 600,
              color: VBT.inkSoft,
            }}
          >
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
    tone === "ok" ? { bg: "#E6F4EA", text: VBT.sigGreen, border: "#B3DDC2" } :
    tone === "warn" ? { bg: "#FFEDD5", text: VBT.sigOrange, border: "#FDBA74" } :
    tone === "bad" ? { bg: "#FEE2E2", text: VBT.sigRed, border: "#FCA5A5" } :
    { bg: "#DBEAFE", text: VBT.sigBlue, border: "#93C5FD" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full whitespace-nowrap"
      style={{
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        padding: "5px 12px",
        fontSize: VBT_TYPO.caption,
        fontWeight: 700,
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </span>
  );
}
