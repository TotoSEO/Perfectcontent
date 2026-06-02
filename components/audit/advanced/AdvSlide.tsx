"use client";

import { ReactNode } from "react";
import { VBT, VBT_TYPO, VBT_FONT, hardShadow } from "@/lib/audit/brand";

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
          boxShadow: "0 24px 60px -28px rgba(26,24,20,0.45)",
          border: `1.5px solid ${VBT.ink}`,
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
              {/* Mono kicker with a leading rule : editorial section marker */}
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  style={{ width: 22, height: 2, background: VBT.terracotta500, borderRadius: 2 }}
                />
                <span
                  className="uppercase truncate"
                  style={{
                    color: VBT.terracotta600,
                    fontWeight: 600,
                    fontSize: VBT_TYPO.micro,
                    letterSpacing: "0.22em",
                    fontFamily: VBT_FONT.mono,
                  }}
                >
                  {subtitle || `Slide ${index + 1} / ${total}`}
                </span>
              </div>
              <h2
                className="mt-2.5"
                style={{
                  fontFamily: VBT_FONT.display,
                  fontWeight: 800,
                  fontSize: VBT_TYPO.pageTitle,
                  letterSpacing: "-0.01em",
                  color: VBT.ink,
                  lineHeight: 1.08,
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

        {/* Single brand lockup (4.5) : Visibili'tea + slide N/M in the
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
                fontFamily: VBT_FONT.display,
                color: VBT.terracotta600,
                letterSpacing: "0.01em",
                fontSize: VBT_TYPO.caption + 1,
              }}
            >
              Visibili&apos;tea
            </span>
            <span style={{ color: VBT.paperEdge }}>·</span>
            <span style={{ fontFamily: VBT_FONT.body }}>{footer || "Audit technique avancé SEO"}</span>
          </div>
          <div
            className="tabular-nums inline-flex items-center"
            style={{
              fontFamily: VBT_FONT.title,
              fontWeight: 700,
              color: VBT.ink,
              letterSpacing: "0.03em",
              background: VBT.cream100,
              border: `1.5px solid ${VBT.ink}`,
              borderRadius: 999,
              boxShadow: hardShadow(2),
              padding: "3px 11px",
              fontSize: VBT_TYPO.caption,
            }}
          >
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Sticker badge used to flag a section status. DS recipe : saturated
 * fill, ink text, 2px ink border, hard offset shadow. */
export function SectionPill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warn" | "ok" | "bad" }) {
  // Saturated tea-palette fills with ink text (the DS badge style).
  const bg =
    tone === "ok" ? "#bfe6cd" :
    tone === "warn" ? VBT.amber300 :
    tone === "bad" ? "#e9b3a4" :
    VBT.cream200;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{
        background: bg,
        color: VBT.ink,
        border: `2px solid ${VBT.ink}`,
        borderRadius: 999,
        boxShadow: hardShadow(3),
        padding: "5px 13px",
        fontSize: VBT_TYPO.caption,
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontFamily: VBT_FONT.title,
      }}
    >
      {children}
    </span>
  );
}
