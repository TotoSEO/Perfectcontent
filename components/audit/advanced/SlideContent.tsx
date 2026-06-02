"use client";

import { VBT, VBT_TYPO, VBT_FONT, hardShadow, VBT_CARD, VBT_CARD_SM, VBT_BLOB_RADIUS } from "@/lib/audit/brand";
import { BarChart, DonutChart, Histogram } from "../Charts";
import { SectionPill } from "./AdvSlide";
import { RecoIcon, iconForReco } from "./RecoIcons";
import { RadarChart } from "./RadarChart";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  FileSpreadsheetIcon,
  FlameIcon,
  HammerIcon,
  ImagePlusIcon,
  QuoteIcon,
  SparklesIcon,
  TrendingUpIcon,
  ZapIcon,
} from "./Icons";
import type {
  AdvKPI,
  AdvSlide,
  AnchorDestinationSummary,
  PriorityItem,
} from "@/lib/audit/advanced/types";

// ---------------------------------------------------------------------------
// KPI tile (now uses semantic urgency palette per 4.6).
// ---------------------------------------------------------------------------

const KPI_PALETTES = {
  ok:   { bg: "#e6f3eb", text: VBT.sigGreen,  border: "#9bc4ad" },
  warn: { bg: "#fcf2dc", text: VBT.sigOrange, border: "#efd07f" },
  bad:  { bg: "#fbe3dd", text: VBT.sigRed,    border: "#e29a8d" },
  info: { bg: "#e1eef5", text: VBT.sigBlue,   border: "#a8c9d6" },
} as const;

export function AdvKpiTile({ kpi, size = "md" }: { kpi: AdvKPI; size?: "sm" | "md" | "lg" }) {
  const palette = KPI_PALETTES[kpi.tone || "ok"];
  // Centered "stat card" : the figure leads (warm display serif), the label
  // sits centered underneath. Reads as a deliberate metric, not a wide
  // half-empty rectangle.
  const valueSize = size === "lg" ? 46 : size === "sm" ? 26 : 38;
  const pad = size === "lg" ? "18px 16px" : size === "sm" ? "12px 10px" : "16px 14px";
  return (
    <div
      className="min-w-0 flex flex-col items-center justify-center text-center gap-1"
      style={{
        background: palette.bg,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 16,
        boxShadow: hardShadow(size === "lg" ? 5 : 3),
        padding: pad,
        minHeight: size === "sm" ? 72 : 96,
      }}
    >
      <div
        className="tabular-nums leading-none"
        style={{
          color: palette.text,
          fontWeight: 800,
          fontFamily: VBT_FONT.display,
          fontSize: valueSize,
          letterSpacing: "-0.01em",
        }}
      >
        {kpi.value}
      </div>
      <div
        className="uppercase"
        style={{
          color: VBT.inkSoft,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.12em",
          lineHeight: 1.25,
          maxWidth: "100%",
        }}
        title={kpi.label}
      >
        {kpi.label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Voir l'onglet …" badge : replaces the unicode ⎘ with a real Lucide-style
// spreadsheet icon (4.2).
// ---------------------------------------------------------------------------

export function XlsxRefBadge({ sheet }: { sheet: string }) {
  return (
    <div
      className="inline-flex items-center gap-2.5"
      style={{
        background: VBT.cream100,
        border: `2px solid ${VBT.ink}`,
        borderRadius: 999,
        boxShadow: hardShadow(2.5),
        color: VBT.ink,
        fontWeight: 600,
        fontSize: VBT_TYPO.caption,
        padding: "6px 13px 6px 8px",
      }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 22,
          height: 22,
          background: VBT.terracotta500,
          border: `1.5px solid ${VBT.ink}`,
          borderRadius: 999,
          color: VBT.paper,
        }}
      >
        <FileSpreadsheetIcon size={12} color={VBT.paper} />
      </span>
      <span style={{ fontFamily: VBT_FONT.title, fontWeight: 600 }}>
        Onglet&nbsp;<strong style={{ fontWeight: 800 }}>« {sheet} »</strong>
      </span>
    </div>
  );
}

export function NoIssuesBlock() {
  return (
    <div
      className="flex-1 flex items-center justify-center gap-3 rounded-xl"
      style={{
        border: `1px dashed #9bc4ad`,
        background: "#e6f3eb",
        color: VBT.sigGreen,
        fontWeight: 600,
        fontSize: VBT_TYPO.body,
        minHeight: 80,
        padding: 16,
      }}
    >
      <CheckCircleIcon size={20} color={VBT.sigGreen} />
      Aucun problème détecté dans cette catégorie
    </div>
  );
}

export function DescriptionBlock({ text, maxLines = 6, size }: { text: string; maxLines?: number; size?: number }) {
  return (
    <p
      className="whitespace-pre-line"
      style={{
        color: VBT.inkSoft,
        fontSize: size ?? VBT_TYPO.body,
        lineHeight: 1.55,
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {text}
    </p>
  );
}

// "Takeaway" : a DS card-style note with an ink-bordered chevron chip.
function TakeawayBlock({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-3"
      style={{
        background: VBT.amber50,
        color: VBT.ink,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 14,
        boxShadow: hardShadow(3),
        fontWeight: 500,
        padding: "12px 16px",
        fontSize: VBT_TYPO.bodySm,
        lineHeight: 1.5,
      }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center mt-0.5"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          background: VBT.terracotta500,
          border: `1.5px solid ${VBT.ink}`,
          color: VBT.paper,
        }}
      >
        <ChevronRightIcon size={12} color={VBT.paper} />
      </span>
      <span>{text}</span>
    </div>
  );
}

export function ChartContainer({
  children,
  maxWidth = 320,
  caption,
}: {
  children: React.ReactNode;
  maxWidth?: number | string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 min-h-0">
      {caption && (
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, background: VBT.terracotta500 }}
          />
          {caption}
        </div>
      )}
      <div
        className="p-4 w-full"
        style={{
          background: VBT.paper,
          border: `1.5px solid ${VBT.ink}`,
          borderRadius: 16,
          boxShadow: hardShadow(4),
          maxWidth,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ===========================================================================
// DATA SLIDE
// ===========================================================================

export function DataSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "data" }> }) {
  const hasIssues = slide.issues_count > 0;
  const hasChart = !!slide.chart;
  // Sparse = chart-less, ≤ 2 KPIs => hero figure layout.
  const isSparse = !hasChart && slide.kpis.length <= 2;
  if (isSparse) return <SparseSlideBody slide={slide} />;

  // When a chart IS present, only keep the headline KPIs (max 2) so the
  // chart doesn't duplicate the same info (4.7). The chart already shows
  // the breakdown.
  const kpisForChart = slide.kpis.slice(0, 2);
  const kpisNoChart = slide.kpis;

  // No-chart slides put the KPIs in a single horizontal row so the centered
  // stat cards read as a balanced band rather than a stacked 2-column block.
  const noChartCols = Math.min(kpisNoChart.length || 1, 4);

  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      {/* Description (with terracotta left-bar) + xlsx badge */}
      <div className="flex items-start gap-6 min-w-0">
        <div
          className="flex-1 min-w-0 rounded-r-md"
          style={{
            borderLeft: `3px solid ${VBT.terracotta500}`,
            paddingLeft: 14,
          }}
        >
          <DescriptionBlock text={slide.description} maxLines={5} size={VBT_TYPO.bodySm} />
        </div>
        {hasIssues && slide.xlsx_sheet && (
          <div className="shrink-0">
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}
      </div>

      {/* Main body */}
      <div
        className="flex-1 grid gap-8 min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: hasChart ? "minmax(0, 4fr) minmax(0, 6fr)" : "1fr",
        }}
      >
        {/* Left column : KPIs (2 hero tiles when chart present).
            Vertically centered so a short stack reads as deliberate balance
            against the chart instead of leaving a void at the bottom. */}
        <div className="flex flex-col gap-4 min-w-0 justify-center">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${hasChart ? 1 : noChartCols}, minmax(0, 1fr))` }}
          >
            {(hasChart ? kpisForChart : kpisNoChart).map((k, i) => (
              <AdvKpiTile key={i} kpi={k} size={hasChart ? "lg" : "md"} />
            ))}
          </div>
          {slide.takeaway && !hasChart && <TakeawayBlock text={slide.takeaway} />}
        </div>

        {/* Right column : chart + takeaway, vertically centered to match. */}
        {hasChart && (
          <div className="flex flex-col gap-3 min-w-0 min-h-0 justify-center">
            <ChartContainer maxWidth="100%" caption={chartCaption(slide.chart!.type)}>
              {slide.chart!.type === "donut" && (
                <DonutChart segments={slide.chart!.segments} size={200} thickness={32} />
              )}
              {slide.chart!.type === "bar" && (
                <BarChart bars={slide.chart!.bars} max={slide.chart!.max} barHeight={24} gap={8} />
              )}
              {slide.chart!.type === "histogram" && (
                <Histogram bins={slide.chart!.bins} height={180} />
              )}
            </ChartContainer>
            {slide.takeaway && <TakeawayBlock text={slide.takeaway} />}
          </div>
        )}
      </div>

      {!hasChart && !slide.takeaway && !hasIssues && <NoIssuesBlock />}
    </div>
  );
}

// Hero layout used when there's a single big figure ("Title dupliqués" etc.).
// The hero number is 4.1: 60-80 px to give it real visual weight.
function SparseSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "data" }> }) {
  const hasIssues = slide.issues_count > 0;
  const heroKpi = slide.kpis[0];
  const secondaryKpi = slide.kpis[1];
  const ring =
    heroKpi?.tone === "bad" ? { fill: VBT.sigRed, soft: "#fbe3dd", ringEdge: "#e29a8d" } :
    heroKpi?.tone === "warn" ? { fill: VBT.sigOrange, soft: "#fcf2dc", ringEdge: "#efd07f" } :
    heroKpi?.tone === "info" ? { fill: VBT.sigBlue, soft: "#e1eef5", ringEdge: "#a8c9d6" } :
    { fill: VBT.sigGreen, soft: "#e6f3eb", ringEdge: "#9bc4ad" };

  return (
    <div className="flex-1 grid grid-cols-12 gap-10 min-h-0 items-center pb-2">
      {/* Left: description + xlsx + takeaway */}
      <div className="col-span-7 flex flex-col gap-5 min-w-0">
        <div
          className="rounded-r-md"
          style={{ borderLeft: `3px solid ${VBT.terracotta500}`, paddingLeft: 16 }}
        >
          <DescriptionBlock text={slide.description} maxLines={10} size={VBT_TYPO.bodySm} />
        </div>
        {hasIssues && slide.xlsx_sheet && (
          <div>
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}
        {slide.takeaway && <TakeawayBlock text={slide.takeaway} />}
      </div>

      {/* Right: hero figure */}
      <div className="col-span-5 flex items-center justify-center min-w-0">
        {heroKpi ? (
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: 260,
                height: 260,
                background: ring.soft,
                border: `1px solid ${ring.ringEdge}`,
                boxShadow: hardShadow(4),
              }}
            >
              <span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  width: 215,
                  height: 215,
                  background: VBT.paper,
                  border: `1px solid ${ring.ringEdge}`,
                }}
              />
              <div
                className="relative flex flex-col items-center justify-center"
                style={{ width: 215, height: 215 }}
              >
                <div
                  className="tabular-nums"
                  style={{
                    color: ring.fill,
                    fontFamily: VBT_FONT.display,
                    fontWeight: 800,
                    fontSize: 76,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  {heroKpi.value}
                </div>
                <div
                  className="mt-2.5 px-4 text-center uppercase"
                  style={{
                    color: VBT.inkSoft,
                    fontWeight: 700,
                    fontSize: VBT_TYPO.micro,
                    letterSpacing: "0.18em",
                    fontFamily: VBT_FONT.mono,
                  }}
                >
                  {heroKpi.label}
                </div>
              </div>
            </div>
            {secondaryKpi && (
              <div
                className="rounded-lg text-center"
                style={{
                  background: VBT.paper,
                  border: `1.5px solid ${VBT.ink}`,
                  minWidth: 200,
                  padding: "10px 16px",
                }}
              >
                <div
                  className="uppercase"
                  style={{
                    color: VBT.zinc,
                    fontWeight: 700,
                    fontSize: VBT_TYPO.micro,
                    letterSpacing: "0.14em",
                  }}
                >
                  {secondaryKpi.label}
                </div>
                <div
                  className="tabular-nums"
                  style={{
                    color: VBT.ink,
                    fontFamily: VBT_FONT.title,
                    fontWeight: 700,
                    fontSize: 22,
                  }}
                >
                  {secondaryKpi.value}
                </div>
              </div>
            )}
          </div>
        ) : (
          <NoIssuesBlock />
        )}
      </div>
    </div>
  );
}

function chartCaption(type: "donut" | "bar" | "histogram" | "stat-grid"): string {
  switch (type) {
    case "donut":     return "Répartition";
    case "bar":       return "Volume par catégorie";
    case "histogram": return "Distribution";
    default:          return "Données";
  }
}

// ===========================================================================
// INFO SLIDE
// ===========================================================================

export function InfoSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "info" }> }) {
  if (slide.screenshot_placeholder) {
    return (
      <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
        <div className="col-span-7 flex flex-col gap-4 min-w-0 min-h-0">
          <div
            className="flex-1 min-w-0 rounded-r-md min-h-0 overflow-hidden"
            style={{ borderLeft: `3px solid ${VBT.terracotta500}`, paddingLeft: 16 }}
          >
            <DescriptionBlock text={slide.description} maxLines={11} />
          </div>
          {slide.callout && <Callout callout={slide.callout} />}
        </div>
        <div className="col-span-5 min-w-0 flex items-stretch">
          <div
            className="flex-1 rounded-xl flex flex-col items-center justify-center text-center"
            style={{
              background: VBT.paper,
              border: `2px dashed ${VBT.paperEdge}`,
              color: VBT.zinc,
              padding: 28,
            }}
          >
            <span
              className="rounded-xl flex items-center justify-center mb-3"
              style={{
                width: 64,
                height: 64,
                background: VBT.terracotta50,
                border: `1px solid ${VBT.terracotta100}`,
              }}
            >
              <ImagePlusIcon size={32} color={VBT.terracotta500} />
            </span>
            <div
              className="uppercase mb-1.5"
              style={{
                color: VBT.terracotta600,
                fontWeight: 700,
                fontSize: VBT_TYPO.micro,
                letterSpacing: "0.16em",
              }}
            >
              Emplacement capture
            </div>
            <div
              className="max-w-xs leading-relaxed"
              style={{ color: VBT.inkSoft, fontSize: VBT_TYPO.caption }}
            >
              Insérez ici votre capture du test JavaScript désactivé, et votre commentaire sur ce qui disparaît du rendu.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      <DescriptionBlock text={slide.description} maxLines={10} />

      {slide.facts && slide.facts.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-1">
          {slide.facts.map((f, i) => (
            <div
              key={i}
              className="rounded-xl"
              style={{
                background: VBT.terracotta50,
                border: `1px solid ${VBT.terracotta100}`,
                padding: "14px 18px",
              }}
            >
              <div
                className="uppercase"
                style={{
                  color: VBT.zinc,
                  fontWeight: 700,
                  fontSize: VBT_TYPO.micro,
                  letterSpacing: "0.16em",
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  color: VBT.terracotta700,
                  fontWeight: 700,
                  fontFamily: VBT_FONT.title,
                  fontSize: 22,
                  marginTop: 4,
                }}
              >
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {slide.callout && (
        <div className="mt-auto">
          <Callout callout={slide.callout} />
        </div>
      )}
    </div>
  );
}

function Callout({ callout }: { callout: { tone: "warn" | "info"; title: string; body: string } }) {
  const isWarn = callout.tone === "warn";
  const bg = isWarn ? "#fcf2dc" : "#e1eef5";
  const fg = isWarn ? VBT.sigOrange : VBT.sigBlue;
  return (
    <div
      className="flex items-start gap-3"
      style={{
        background: bg,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 14,
        boxShadow: hardShadow(3),
        padding: "14px 18px",
      }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: fg }}>
        <AlertTriangleIcon size={18} color={fg} />
      </span>
      <div className="min-w-0">
        <div
          className="uppercase"
          style={{
            color: fg,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
            marginBottom: 4,
          }}
        >
          {callout.title}
        </div>
        <div
          style={{
            color: VBT.inkSoft,
            fontSize: VBT_TYPO.bodySm + 1,
            lineHeight: 1.55,
          }}
        >
          {callout.body}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SECTION COVER
// ===========================================================================

export function SectionCoverBody({ slide, partOf }: { slide: Extract<AdvSlide, { kind: "section-cover" }>; partOf: string }) {
  return (
    <div className="flex-1 flex items-center gap-12 min-h-0">
      <div className="flex-1 min-w-0 max-w-3xl">
        <div className="flex items-center gap-4 mb-5">
          {/* Organic blob icon (DS signature) */}
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 66,
              height: 66,
              background: VBT.amber200,
              border: `2px solid ${VBT.ink}`,
              borderRadius: VBT_BLOB_RADIUS,
              boxShadow: hardShadow(4),
              transform: "rotate(-3deg)",
              color: VBT.ink,
            }}
          >
            <RecoIcon name={slide.icon} size={36} />
          </span>
          <div>
            {/* "Partie X sur N" as a sticker badge. */}
            <span
              className="uppercase inline-flex items-center"
              style={{
                color: VBT.ink,
                background: VBT.cream100,
                border: `2px solid ${VBT.ink}`,
                borderRadius: 999,
                boxShadow: hardShadow(2),
                padding: "5px 13px",
                fontWeight: 700,
                fontSize: VBT_TYPO.caption,
                letterSpacing: "0.16em",
                fontFamily: VBT_FONT.title,
              }}
            >
              {partOf}
            </span>
          </div>
        </div>
        <h1
          className="leading-[1.0] mt-2"
          style={{
            fontFamily: VBT_FONT.display,
            fontWeight: 800,
            fontSize: 70,
            letterSpacing: "-0.015em",
            color: VBT.ink,
          }}
        >
          {slide.title}
        </h1>
        <div
          className="mt-3 h-1.5 rounded-full"
          style={{
            width: 120,
            background: `linear-gradient(90deg, ${VBT.terracotta600}, ${VBT.amber400})`,
          }}
        />
        <ul className="mt-10 space-y-4">
          {slide.bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-4"
              style={{ color: VBT.ink, fontSize: VBT_TYPO.body + 1 }}
            >
              <span
                className="inline-flex items-center justify-center shrink-0 tabular-nums"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: VBT.terracotta500,
                  color: VBT.paper,
                  border: `1.5px solid ${VBT.ink}`,
                  boxShadow: hardShadow(2),
                  fontWeight: 800,
                  fontSize: 13,
                  fontFamily: VBT_FONT.title,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontWeight: 500, lineHeight: 1.5 }}>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Decorative side panel : a DS card framing a big blob icon */}
      <div className="hidden md:flex shrink-0 items-center justify-center pl-8">
        <div
          className="relative flex items-center justify-center"
          style={{
            width: 264,
            height: 264,
            background: `linear-gradient(135deg, ${VBT.terracotta50} 0%, ${VBT.amber50} 100%)`,
            border: `1.5px solid ${VBT.ink}`,
            borderRadius: 24,
            boxShadow: hardShadow(7),
          }}
        >
          {/* big blob holding the icon */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 150,
              height: 150,
              background: VBT.paper,
              border: `2px solid ${VBT.ink}`,
              borderRadius: VBT_BLOB_RADIUS,
              boxShadow: hardShadow(4),
              transform: "rotate(-4deg)",
              color: VBT.ink,
            }}
          >
            <RecoIcon name={slide.icon} size={76} />
          </div>
          {/* sticker dots */}
          <span
            aria-hidden
            className="absolute"
            style={{ top: 14, right: 14, width: 14, height: 14, borderRadius: 999, background: VBT.amber300, border: `1.5px solid ${VBT.ink}` }}
          />
          <span
            aria-hidden
            className="absolute"
            style={{ bottom: 14, left: 14, width: 11, height: 11, borderRadius: 999, background: VBT.terracotta400, border: `1.5px solid ${VBT.ink}` }}
          />
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// RECOMMENDATIONS SLIDE : visual card grid (4.11)
// ===========================================================================

export function RecoSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "reco" }> }) {
  // analyze.ts now chunks reco slides to <= 2 groups each, so a single group
  // gets the full width and two groups split 50/50. Either way each bullet
  // has room to breathe and is never truncated.
  const count = slide.groups.length || 1;
  return (
    <div
      className="flex-1 grid gap-6 min-h-0 overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${Math.min(count, 2)}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
      }}
    >
      {slide.groups.map((g, i) => (
        <RecoCard
          key={i}
          subLabel={g.sub_label}
          items={g.items.slice(0, 5)}
          accentIndex={i}
        />
      ))}
    </div>
  );
}

function RecoCard({
  subLabel,
  items,
  accentIndex,
}: {
  subLabel: string;
  items: string[];
  accentIndex: number;
}) {
  const tint = accentIndex % 2 === 0
    ? { band: VBT.terracotta50, accent: VBT.terracotta700, chip: VBT.terracotta500, blob: VBT.amber200 }
    : { band: VBT.amber50, accent: VBT.amber700, chip: VBT.brick400, blob: VBT.terracotta200 };
  const iconKey = iconForReco(subLabel);
  return (
    <div
      className="overflow-hidden flex flex-col min-w-0"
      style={{
        background: VBT.paper,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 18,
        boxShadow: hardShadow(5),
      }}
    >
      {/* Header band */}
      <div
        className="flex items-center gap-3 min-w-0 shrink-0"
        style={{
          background: tint.band,
          borderBottom: `1.5px solid ${VBT.ink}`,
          padding: "14px 18px",
        }}
      >
        {/* Organic "blob" icon container (DS signature) */}
        <span
          className="shrink-0 inline-flex items-center justify-center"
          style={{
            width: 46,
            height: 46,
            background: tint.blob,
            border: `1.5px solid ${VBT.ink}`,
            borderRadius: VBT_BLOB_RADIUS,
            boxShadow: hardShadow(2.5),
            transform: "rotate(-3deg)",
            color: VBT.ink,
          }}
        >
          <RecoIcon name={iconKey} size={26} />
        </span>
        <div
          className="min-w-0"
          style={{
            fontFamily: VBT_FONT.title,
            color: VBT.ink,
            fontWeight: 800,
            fontSize: 20,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
          title={subLabel}
        >
          {subLabel}
        </div>
      </div>

      {/* Numbered actions, vertically centered so the card never looks empty */}
      <ul className="flex-1 flex flex-col justify-center gap-3.5 overflow-hidden min-h-0" style={{ padding: "18px 20px" }}>
        {items.map((item, j) => (
          <li key={j} className="flex items-start gap-3">
            <span
              className="shrink-0 inline-flex items-center justify-center tabular-nums"
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                background: tint.chip,
                color: VBT.paper,
                border: `1.5px solid ${VBT.ink}`,
                fontSize: 11,
                fontWeight: 800,
                fontFamily: VBT_FONT.title,
                marginTop: 1,
              }}
            >
              {j + 1}
            </span>
            <span
              style={{
                color: VBT.ink,
                lineHeight: 1.5,
                fontSize: VBT_TYPO.bodySm,
                fontFamily: VBT_FONT.body,
              }}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===========================================================================
// ANCHOR : LOW DIVERSITY (URLs avec ancres pas assez variées)
// Top 5 destination URLs whose inbound contextual links use the same anchor
// over and over. Empty anchors are NOT in this slide.
// ===========================================================================

export function AnchorLowDiversityBody({
  slide,
}: {
  slide: Extract<AdvSlide, { kind: "anchor-low-diversity" }>;
}) {
  const visible = slide.rows.slice(0, 5);
  const extra = Math.max(0, slide.total_concerned - visible.length);

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
      {/* LEFT : top 5 table */}
      <div className="col-span-8 flex flex-col gap-3 min-w-0 min-h-0">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div
            className="uppercase flex items-center gap-2"
            style={{
              color: VBT.terracotta600,
              fontWeight: 700,
              fontSize: VBT_TYPO.micro,
              letterSpacing: "0.18em",
              fontFamily: VBT_FONT.mono,
            }}
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 6, height: 6, background: VBT.terracotta500 }}
            />
            Top 5 · ancres dominantes par page cible
          </div>
          {slide.xlsx_sheet && slide.issues_count > 0 && (
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          )}
        </div>

        {visible.length === 0 ? (
          <NoIssuesBlock />
        ) : (
          <div
            className="rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0"
            style={{
              border: `1.5px solid ${VBT.ink}`,
              background: VBT.paper,
            }}
          >
            <table className="w-full" style={{ tableLayout: "fixed", fontSize: VBT_TYPO.bodySm }}>
              <colgroup>
                <col style={{ width: "42%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead style={{ background: VBT.terracotta50 }}>
                <tr>
                  <Th>URL concernée</Th>
                  <Th>Ancre dominante</Th>
                  <Th align="right">Occur.</Th>
                  <Th align="right">Domination</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const tone =
                    r.ratio_pct >= 80 ? { bg: "#fbe3dd", fg: VBT.sigRed } :
                    r.ratio_pct >= 65 ? { bg: "#fcf2dc", fg: VBT.sigOrange } :
                    { bg: "#fcf6e6", fg: "#6c4a14" };
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${VBT.paperEdge}` }}>
                      <td
                        className="px-3 py-2.5 align-top"
                        style={{
                          color: VBT.ink,
                          fontWeight: 500,
                          wordBreak: "break-all",
                          fontSize: VBT_TYPO.caption,
                          lineHeight: 1.4,
                        }}
                      >
                        {r.destination}
                      </td>
                      <td
                        className="px-3 py-2.5 align-top"
                        style={{
                          color: VBT.terracotta700,
                          fontWeight: 600,
                          fontSize: VBT_TYPO.caption + 1,
                          wordBreak: "break-word",
                          lineHeight: 1.4,
                        }}
                      >
                        « {r.anchor} »
                      </td>
                      <td
                        className="px-3 py-2.5 tabular-nums text-right align-top"
                        style={{
                          color: VBT.ink,
                          fontWeight: 700,
                          fontFamily: VBT_FONT.title,
                          fontSize: VBT_TYPO.bodySm,
                        }}
                      >
                        {r.occurrences}/{r.total_inlinks}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        <span
                          className="tabular-nums inline-flex items-center"
                          style={{
                            background: tone.bg,
                            color: VBT.ink,
                            border: `1.5px solid ${VBT.ink}`,
                            borderRadius: 999,
                            fontWeight: 800,
                            fontSize: VBT_TYPO.caption,
                            padding: "2px 9px",
                          }}
                        >
                          {r.ratio_pct.toFixed(0)} %
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {extra > 0 && (
              <div
                className="px-3 py-2.5 flex items-center gap-2"
                style={{
                  background: VBT.terracotta50,
                  borderTop: `1px solid ${VBT.terracotta100}`,
                  color: VBT.terracotta700,
                  fontWeight: 600,
                  fontSize: VBT_TYPO.bodySm,
                }}
              >
                <ArrowRightIcon size={12} color={VBT.terracotta600} />
                <span>+ {extra.toLocaleString("fr-FR")} URLs concernées par le même problème</span>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            color: VBT.zinc,
            fontSize: VBT_TYPO.micro,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          Le pourcentage indique la part des liens contextuels qui utilisent la même ancre vers la page cible. Les ancres vides ne sont pas comptabilisées ici.
        </div>
      </div>

      {/* RIGHT : explanatory text + key takeaway */}
      <div className="col-span-4 flex flex-col gap-3 min-w-0 min-h-0">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, background: VBT.terracotta500 }}
          />
          Pourquoi diversifier ses ancres
        </div>
        <div
          className="flex-1 rounded-xl overflow-y-auto min-h-0"
          style={{
            background: VBT.paper,
            border: `1.5px solid ${VBT.ink}`,
            padding: "16px 18px",
            color: VBT.inkSoft,
            fontSize: VBT_TYPO.bodySm,
            lineHeight: 1.55,
          }}
        >
          <DescriptionBlock text={slide.description} maxLines={10} size={VBT_TYPO.bodySm} />
        </div>
        <div
          className="rounded-xl flex items-start gap-2.5"
          style={{
            background: "#fcf2dc",
            border: "1px solid #efd07f",
            padding: "12px 14px",
          }}
        >
          <span className="shrink-0 mt-0.5">
            <AlertTriangleIcon size={15} color={VBT.sigOrange} />
          </span>
          <div
            style={{
              color: VBT.sigOrange,
              fontSize: VBT_TYPO.bodySm - 1,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            Une ancre qui revient à plus de 60 % vers la même URL doit être variée : reformule contextuellement dans chaque page source.
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-3 py-2.5 uppercase"
      style={{
        color: VBT.ink,
        fontWeight: 800,
        fontSize: VBT_TYPO.micro,
        letterSpacing: "0.08em",
        textAlign: align,
        fontFamily: VBT_FONT.title,
        borderBottom: `1.5px solid ${VBT.ink}`,
      }}
    >
      {children}
    </th>
  );
}

// ===========================================================================
// ANCHOR : EMPTY (URLs recevant trop d'ancres vides)
// Lists target URLs that receive contextual links with NO anchor and NO alt.
// Image-wrapping links are EXCLUDED. Groups are visually separated.
// ===========================================================================

export function AnchorEmptyBody({
  slide,
}: {
  slide: Extract<AdvSlide, { kind: "anchor-empty" }>;
}) {
  const visibleGroups = slide.groups.slice(0, 6);
  const extraGroups = Math.max(0, slide.total_groups - visibleGroups.length);

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
      {/* LEFT : grouped table */}
      <div className="col-span-8 flex flex-col gap-3 min-w-0 min-h-0">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div
            className="uppercase flex items-center gap-2"
            style={{
              color: VBT.terracotta600,
              fontWeight: 700,
              fontSize: VBT_TYPO.micro,
              letterSpacing: "0.18em",
              fontFamily: VBT_FONT.mono,
            }}
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 6, height: 6, background: VBT.sigRed }}
            />
            URLs cibles · {slide.total_empty_links.toLocaleString("fr-FR")} liens vides détectés
          </div>
          {slide.xlsx_sheet && slide.issues_count > 0 && (
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          )}
        </div>

        {visibleGroups.length === 0 ? (
          <NoIssuesBlock />
        ) : (
          <div
            className="flex-1 rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0"
            style={{
              border: `1.5px solid ${VBT.ink}`,
              background: VBT.paper,
            }}
          >
            <div
              className="overflow-y-auto"
              style={{ flex: 1 }}
            >
              {visibleGroups.map((g, gi) => (
                <EmptyAnchorGroup
                  key={gi}
                  destination={g.destination}
                  sources={g.sources}
                  index={gi}
                />
              ))}
            </div>
            {extraGroups > 0 && (
              <div
                className="px-3 py-2.5 flex items-center gap-2"
                style={{
                  background: "#fbe3dd",
                  borderTop: `1px solid #e29a8d`,
                  color: VBT.sigRed,
                  fontWeight: 600,
                  fontSize: VBT_TYPO.bodySm,
                }}
              >
                <ArrowRightIcon size={12} color={VBT.sigRed} />
                <span>+ {extraGroups.toLocaleString("fr-FR")} URLs cibles concernées (voir XLSX)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT : explanation */}
      <div className="col-span-4 flex flex-col gap-3 min-w-0 min-h-0">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, background: VBT.terracotta500 }}
          />
          Pourquoi corriger ces ancres
        </div>
        <div
          className="flex-1 rounded-xl overflow-y-auto min-h-0"
          style={{
            background: VBT.paper,
            border: `1.5px solid ${VBT.ink}`,
            padding: "16px 18px",
            color: VBT.inkSoft,
            fontSize: VBT_TYPO.bodySm,
            lineHeight: 1.55,
          }}
        >
          <DescriptionBlock text={slide.description} maxLines={10} size={VBT_TYPO.bodySm} />
        </div>
        <div
          className="rounded-xl flex items-start gap-2.5"
          style={{
            background: "#fbe3dd",
            border: "1px solid #e29a8d",
            padding: "12px 14px",
          }}
        >
          <span className="shrink-0 mt-0.5">
            <AlertTriangleIcon size={15} color={VBT.sigRed} />
          </span>
          <div
            style={{
              color: VBT.sigRed,
              fontSize: VBT_TYPO.bodySm - 1,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            Les liens-images (alt rempli) ne sont pas comptés ici : seuls les liens contextuels textuels sans aucune ancre.
          </div>
        </div>
      </div>
    </div>
  );
}

// One destination group : a coloured header row with the target URL +
// the count of empty inbound links, followed by indented source URLs.
// Groups alternate between two soft tints so the boundary between two
// adjacent groups is always visible.
function EmptyAnchorGroup({
  destination,
  sources,
  index,
}: {
  destination: string;
  sources: string[];
  index: number;
}) {
  const tint = index % 2 === 0
    ? { headerBg: "#fbe3dd", headerEdge: "#e29a8d", headerFg: VBT.sigRed, bodyBg: "#fbeeec" }
    : { headerBg: "#fcf2dc", headerEdge: "#efd07f", headerFg: VBT.sigOrange, bodyBg: "#fcf6e6" };
  // Cap source URLs displayed inline to keep slides readable; the rest live
  // in the XLSX.
  const visibleSources = sources.slice(0, 4);
  const extraSources = sources.length - visibleSources.length;

  return (
    <div style={{ borderBottom: `2px solid ${tint.headerEdge}` }}>
      {/* Group header : target URL + count */}
      <div
        className="flex items-start gap-2.5"
        style={{
          background: tint.headerBg,
          padding: "9px 14px",
          borderBottom: `1px solid ${tint.headerEdge}`,
        }}
      >
        <span className="shrink-0 mt-1">
          <ArrowRightIcon size={11} color={tint.headerFg} />
        </span>
        <div className="flex-1 min-w-0">
          <div
            style={{
              color: tint.headerFg,
              fontWeight: 800,
              fontFamily: VBT_FONT.title,
              fontSize: VBT_TYPO.bodySm,
              wordBreak: "break-all",
              lineHeight: 1.35,
              letterSpacing: "-0.005em",
            }}
            title={destination}
          >
            {destination}
          </div>
        </div>
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-full tabular-nums"
          style={{
            background: tint.headerFg,
            color: VBT.paper,
            minWidth: 32,
            height: 22,
            fontSize: VBT_TYPO.micro,
            fontWeight: 800,
            padding: "0 8px",
            marginTop: 1,
          }}
        >
          {sources.length}
        </span>
      </div>

      {/* Source URLs in the group */}
      <div
        style={{
          background: tint.bodyBg,
          padding: "6px 14px 8px 30px",
        }}
      >
        {visibleSources.map((src, i) => (
          <div
            key={i}
            className="flex items-start gap-2"
            style={{
              padding: "2px 0",
              color: VBT.inkSoft,
              fontSize: VBT_TYPO.micro + 1,
              lineHeight: 1.45,
              wordBreak: "break-all",
            }}
          >
            <span
              className="shrink-0 mt-1.5 inline-block"
              style={{
                width: 4,
                height: 4,
                background: tint.headerEdge,
                borderRadius: "50%",
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }} title={src}>{src}</span>
            <span
              className="shrink-0 inline-flex items-center rounded uppercase tabular-nums"
              style={{
                color: tint.headerFg,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "1px 6px",
                background: tint.headerBg,
                marginLeft: 6,
              }}
            >
              ancre vide
            </span>
          </div>
        ))}
        {extraSources > 0 && (
          <div
            className="mt-1"
            style={{
              color: tint.headerFg,
              fontSize: VBT_TYPO.micro,
              fontWeight: 700,
              fontStyle: "italic",
              paddingLeft: 8,
            }}
          >
            + {extraSources} autre{extraSources > 1 ? "s" : ""} page{extraSources > 1 ? "s" : ""} source · voir XLSX
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// LEGACY anchor renderers (anchor-bars / anchor-table) : kept so audits
// generated before this refactor still load, but new audits don't produce
// these kinds.
// ===========================================================================

export function AnchorBarsBody({ slide }: { slide: Extract<AdvSlide, { kind: "anchor-bars" }> }) {
  const hasData = slide.destinations.length > 0;
  // Flatten top anchors across destinations for a single horizontal bar chart.
  // Per 4.8 the slide should be a clean horizontal bar of dominant anchors,
  // not a 6-mini-chart grid. We keep the per-destination grouping but render
  // as one tall list on the left and a "what to look at" panel on the right.
  const all = hasData
    ? slide.destinations.slice(0, 6).map((d) => ({
        destination: d.destination,
        anchors: d.anchors.slice(0, 4),
        total: d.anchors.reduce((a, x) => a + x.count, 0),
      }))
    : [];
  const maxCount = Math.max(1, ...all.flatMap((d) => d.anchors.map((a) => a.count)));

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="flex items-start justify-between gap-6 min-w-0">
        <div className="flex-1 min-w-0">
          <DescriptionBlock text={slide.description} maxLines={3} />
        </div>
        {slide.xlsx_sheet && slide.issues_count > 0 && (
          <div className="shrink-0">
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}
      </div>

      {!hasData ? (
        <NoIssuesBlock />
      ) : (
        <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
          {/* Main horizontal bar chart : pages stacked, each with their top
              anchors as proportional bars */}
          <div
            className="col-span-8 rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0"
            style={{
              border: `1.5px solid ${VBT.ink}`,
              background: VBT.paper,
              padding: "18px 22px",
            }}
          >
            <div
              className="uppercase flex items-center gap-2 mb-3"
              style={{
                color: VBT.terracotta600,
                fontWeight: 700,
                fontSize: VBT_TYPO.micro,
                letterSpacing: "0.18em",
                fontFamily: VBT_FONT.mono,
              }}
            >
              <span
                className="inline-block rounded-full"
                style={{ width: 6, height: 6, background: VBT.terracotta500 }}
              />
              Top ancres par page de destination
            </div>
            <div className="flex-1 overflow-hidden flex flex-col gap-3">
              {all.map((d, i) => (
                <div key={i} className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowRightIcon size={11} color={VBT.terracotta500} />
                    <div
                      className="truncate"
                      style={{
                        color: VBT.terracotta700,
                        fontWeight: 600,
                        fontSize: VBT_TYPO.bodySm,
                      }}
                      title={d.destination}
                    >
                      {shortenUrl(d.destination, 64)}
                    </div>
                    <span
                      className="ml-auto tabular-nums shrink-0"
                      style={{
                        color: VBT.zinc,
                        fontSize: VBT_TYPO.caption,
                        fontWeight: 600,
                      }}
                    >
                      {d.total} liens
                    </span>
                  </div>
                  <div className="space-y-1">
                    {d.anchors.map((a, j) => {
                      const w = (a.count / maxCount) * 100;
                      const isEmpty = !a.text;
                      return (
                        <div key={j} className="flex items-center gap-3 min-w-0">
                          <div
                            className="truncate shrink-0 text-right"
                            style={{
                              color: isEmpty ? VBT.sigRed : VBT.inkSoft,
                              fontSize: VBT_TYPO.caption,
                              width: 160,
                              fontWeight: isEmpty ? 700 : 500,
                              fontStyle: isEmpty ? "italic" : "normal",
                            }}
                            title={a.text}
                          >
                            {a.text || "(ancre vide)"}
                          </div>
                          <div
                            className="relative flex-1 rounded-md overflow-hidden min-w-0"
                            style={{ height: 14, background: VBT.paperEdge + "66" }}
                          >
                            <div
                              className="absolute inset-y-0 left-0 rounded-md"
                              style={{
                                width: `${w}%`,
                                background: isEmpty
                                  ? `linear-gradient(90deg, ${VBT.sigRed}DD, ${VBT.sigRed})`
                                  : `linear-gradient(90deg, ${VBT.terracotta400}DD, ${VBT.terracotta500})`,
                              }}
                            />
                          </div>
                          <div
                            className="tabular-nums shrink-0 text-right"
                            style={{
                              color: VBT.inkSoft,
                              fontSize: VBT_TYPO.caption,
                              fontWeight: 600,
                              width: 32,
                            }}
                          >
                            {a.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Side panel : reading guide */}
          <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-hidden">
            <ReadingGuideCard
              tone="info"
              title="Comment lire ce graphique ?"
              body="Chaque barre représente le nombre de liens entrants pour une ancre donnée vers une page de destination. Les barres rouges indiquent des ancres vides (texte alt et ancrage absents)."
            />
            <ReadingGuideCard
              tone="warn"
              title="Pourquoi ça compte"
              body="Une ancre dominante répétée des centaines de fois envoie un signal pauvre à Google : variez vos formulations contextuelles pour transmettre plus de sens."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ReadingGuideCard({ title, body, tone }: { title: string; body: string; tone: "warn" | "info" }) {
  const isWarn = tone === "warn";
  const bg = isWarn ? "#fcf2dc" : VBT.terracotta50;
  const edge = isWarn ? "#efd07f" : "#fae0cd";
  const fg = isWarn ? VBT.sigOrange : VBT.terracotta700;
  return (
    <div
      className="rounded-xl flex-1 min-h-0"
      style={{
        background: bg,
        border: `1px solid ${edge}`,
        padding: "14px 16px",
      }}
    >
      <div
        className="uppercase mb-1.5"
        style={{
          color: fg,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.16em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: VBT.inkSoft,
          fontSize: VBT_TYPO.bodySm - 1,
          lineHeight: 1.55,
        }}
      >
        {body}
      </div>
    </div>
  );
}

// ===========================================================================
// ANCHOR TABLE → SCATTER PLOT (4.9)
// Plots each destination as a point : x = inlinks count, y = diversity ratio.
// Bottom-right zone = many inlinks with low diversity = problem.
// ===========================================================================

export function AnchorTableBody({ slide }: { slide: Extract<AdvSlide, { kind: "anchor-table" }> }) {
  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="flex items-start justify-between gap-6 min-w-0">
        <div className="flex-1 min-w-0">
          <DescriptionBlock text={slide.description} maxLines={3} />
        </div>
        {slide.xlsx_sheet && slide.issues_count > 0 && (
          <div className="shrink-0">
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}
      </div>

      {slide.rows.length === 0 ? (
        <NoIssuesBlock />
      ) : (
        <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
          <DiversityScatter rows={slide.rows} />
          <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-hidden">
            <ReadingGuideCard
              tone="info"
              title="Comment lire ce graphique ?"
              body="Chaque point représente une page de destination. L'axe X = nombre de liens entrants. L'axe Y = diversité des ancres (1 = chaque lien a une ancre unique, 0 = toujours la même ancre)."
            />
            <ReadingGuideCard
              tone="warn"
              title="Zone à surveiller (rouge)"
              body="En bas à droite : pages très linkées (>10 inlinks) avec une diversité < 0,3. Le signal sémantique transmis est faible : variez vos ancres contextuelles."
            />
            <div
              className="rounded-xl"
              style={{
                background: VBT.paper,
                border: `1.5px solid ${VBT.ink}`,
                padding: "12px 14px",
              }}
            >
              <div
                className="uppercase mb-2"
                style={{
                  color: VBT.terracotta600,
                  fontWeight: 700,
                  fontSize: VBT_TYPO.micro,
                  letterSpacing: "0.16em",
                }}
              >
                Top 3 à corriger
              </div>
              <ol className="space-y-1.5">
                {slide.rows.slice(0, 3).map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 min-w-0"
                    style={{ fontSize: VBT_TYPO.caption, color: VBT.inkSoft }}
                  >
                    <span
                      className="shrink-0 inline-flex items-center justify-center tabular-nums"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: VBT.sigRed,
                        color: VBT.paper,
                        fontWeight: 800,
                        fontSize: 10,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div
                        className="truncate"
                        style={{ color: VBT.ink, fontWeight: 600 }}
                        title={r.destination}
                      >
                        {shortenUrl(r.destination, 38)}
                      </div>
                      <div className="tabular-nums" style={{ color: VBT.zinc, fontSize: VBT_TYPO.micro }}>
                        {r.inlinks_count} liens · diversité {r.diversity_ratio.toFixed(2)} · « {(r.dominant_anchor || "(vide)").slice(0, 28)} »
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiversityScatter({ rows }: { rows: AnchorDestinationSummary[] }) {
  const W = 560;
  const H = 360;
  const padL = 56;
  const padR = 20;
  const padT = 20;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxX = Math.max(10, ...rows.map((r) => r.inlinks_count));
  // Log-ish x scale : SF data can have a few pages with massive inlinks and
  // many with very few; linear would crush most points to the left.
  const x = (v: number) => padL + (Math.log10(v + 1) / Math.log10(maxX + 1)) * innerW;
  const y = (d: number) => padT + (1 - Math.max(0, Math.min(1, d))) * innerH;

  // Tick positions on the log-ish scale
  const xTicks = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000].filter((v) => v <= maxX);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div
      className="col-span-8 rounded-xl flex flex-col min-w-0 min-h-0"
      style={{
        border: `1.5px solid ${VBT.ink}`,
        background: VBT.paper,
        padding: "18px 22px",
      }}
    >
      <div
        className="uppercase flex items-center gap-2 mb-2"
        style={{
          color: VBT.terracotta600,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.18em",
          fontFamily: VBT_FONT.mono,
        }}
      >
        <span
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: VBT.terracotta500 }}
        />
        Diversité des ancres × volume de liens entrants
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {/* danger zone (bottom right, low diversity & many inlinks) */}
          <rect
            x={x(10)}
            y={y(0.3)}
            width={W - padR - x(10)}
            height={H - padB - y(0.3)}
            fill="#fbe3dd"
            opacity="0.5"
          />
          <text
            x={W - padR - 8}
            y={H - padB - 8}
            textAnchor="end"
            style={{
              fill: VBT.sigRed,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Zone à corriger
          </text>

          {/* axes */}
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={VBT.paperEdge} strokeWidth="1" />
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={VBT.paperEdge} strokeWidth="1" />

          {/* y ticks + grid */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={y(t)}
                x2={W - padR}
                y2={y(t)}
                stroke={VBT.paperEdge}
                strokeDasharray="2 4"
                opacity={t === 0 ? 0 : 0.6}
              />
              <text
                x={padL - 8}
                y={y(t) + 3}
                textAnchor="end"
                style={{ fill: VBT.zinc, fontSize: 10, fontWeight: 600 }}
              >
                {t.toFixed(2)}
              </text>
            </g>
          ))}

          {/* x ticks */}
          {xTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={x(t)}
                y1={H - padB}
                x2={x(t)}
                y2={H - padB + 4}
                stroke={VBT.zinc}
                strokeWidth="1"
              />
              <text
                x={x(t)}
                y={H - padB + 16}
                textAnchor="middle"
                style={{ fill: VBT.zinc, fontSize: 10, fontWeight: 600 }}
              >
                {t}
              </text>
            </g>
          ))}

          {/* axis labels */}
          <text
            x={(padL + W - padR) / 2}
            y={H - 6}
            textAnchor="middle"
            style={{ fill: VBT.inkSoft, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}
          >
            LIENS ENTRANTS (échelle log)
          </text>
          <text
            x={-(padT + (H - padB)) / 2}
            y={14}
            transform="rotate(-90)"
            textAnchor="middle"
            style={{ fill: VBT.inkSoft, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}
          >
            DIVERSITÉ (0–1)
          </text>

          {/* points */}
          {rows.map((r, i) => {
            const cx = x(r.inlinks_count);
            const cy = y(r.diversity_ratio);
            const danger = r.inlinks_count >= 10 && r.diversity_ratio < 0.3;
            const warn = !danger && r.inlinks_count >= 5 && r.diversity_ratio < 0.5;
            const color = danger ? VBT.sigRed : warn ? VBT.sigOrange : VBT.sigBlue;
            const radius = Math.min(10, 3 + Math.log10(r.inlinks_count + 1) * 2.2);
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={color}
                  fillOpacity="0.65"
                  stroke={color}
                  strokeWidth="1.4"
                >
                  <title>
                    {shortenUrl(r.destination, 60)} · {r.inlinks_count} liens · diversité {r.diversity_ratio.toFixed(2)}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      {/* legend */}
      <div className="flex items-center justify-center gap-5 pt-1">
        <LegendDot color={VBT.sigRed} label="Critique (≥10 liens · div < 0,3)" />
        <LegendDot color={VBT.sigOrange} label="À surveiller" />
        <LegendDot color={VBT.sigBlue} label="OK" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2" style={{ fontSize: VBT_TYPO.micro, color: VBT.inkSoft, fontWeight: 600 }}>
      <span
        className="inline-block rounded-full"
        style={{ width: 9, height: 9, background: color }}
      />
      {label}
    </div>
  );
}

// ===========================================================================
// PRIORITY SLIDE : Kanban-style lanes by urgency (4.10)
// ===========================================================================

const URGENCY_LABEL: Record<PriorityItem["urgency"], string> = {
  critical: "Critique",
  high: "Haute",
  medium: "Moyenne",
  low: "Basse",
};

const URGENCY_ICON: Record<PriorityItem["urgency"], typeof FlameIcon> = {
  critical: FlameIcon,
  high: ZapIcon,
  medium: TrendingUpIcon,
  low: HammerIcon,
};

const URGENCY_PALETTE: Record<PriorityItem["urgency"], { fg: string; soft: string; edge: string; label: string }> = {
  critical: { fg: VBT.sigRed,    soft: "#fbe3dd", edge: "#e29a8d", label: VBT.sigRed },
  high:     { fg: VBT.sigOrange, soft: "#fcf2dc", edge: "#efd07f", label: VBT.sigOrange },
  medium:   { fg: "#CA8A04",     soft: "#fcf6e6", edge: "#f7e7b8", label: "#6c4a14" },
  low:      { fg: VBT.sigBlue,   soft: "#e1eef5", edge: "#a8c9d6", label: VBT.sigBlue },
};

// ===========================================================================
// SYNTHESIS RADAR — left : short AI intro + best/worst list ; right : radar.
// AI intro and best/worst lists are generated by the viewer page calling
// /srv/audits/synthesis-overview. When still null, a "Générer" button shows.
// All text is clipped to keep the slide tight (no overflow).
// ===========================================================================

export function SynthesisRadarBody({
  slide,
  onRequestAi,
  busy,
}: {
  slide: Extract<AdvSlide, { kind: "synthesis-radar" }>;
  onRequestAi: () => void;
  busy: boolean;
}) {
  const axes = slide.sections.map((s) => s.label);
  const series = slide.sections.map((s) => s.score);
  const hasAi = !!slide.ai_intro;

  return (
    <div className="flex-1 grid grid-cols-12 gap-8 min-h-0 overflow-hidden">
      {/* LEFT — intro + best/worst */}
      <div className="col-span-6 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <SparklesIcon size={12} color={VBT.terracotta500} />
          Synthèse de l&apos;audit
        </div>

        {hasAi ? (
          <>
            {/* Intro paragraph : two-sentence qualitative angle.
                Clamp at 5 lines as a safety net (the prompt caps at 35-45
                words = ~3 lines at this size). Slightly smaller font than
                body so the eye reads it as the "kicker" of the slide while
                the radar carries the data weight. */}
            <div
              style={{
                color: VBT.ink,
                fontFamily: VBT_FONT.body,
                fontSize: VBT_TYPO.bodySm + 1,
                lineHeight: 1.55,
                display: "-webkit-box",
                WebkitLineClamp: 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {slide.ai_intro}
            </div>

            {slide.ai_best.length > 0 && (
              <BestWorstBlock
                title="Les points les moins critiques du site"
                items={slide.ai_best}
                tone="ok"
              />
            )}
            {slide.ai_worst.length > 0 && (
              <BestWorstBlock
                title="Les points les plus problématiques concernent"
                items={slide.ai_worst}
                tone="bad"
              />
            )}
          </>
        ) : slide.ai_intro_error ? (
          <div
            style={{
              color: VBT.sigRed,
              fontSize: VBT_TYPO.bodySm,
              lineHeight: 1.55,
            }}
          >
            Échec de la génération IA : {slide.ai_intro_error}
            <div className="mt-2">
              <button
                onClick={onRequestAi}
                disabled={busy}
                className="rounded-lg"
                style={{
                  background: VBT.terracotta500,
                  color: VBT.paper,
                  fontWeight: 600,
                  fontSize: VBT_TYPO.caption,
                  padding: "8px 14px",
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3 justify-center">
            <p style={{ color: VBT.inkSoft, fontSize: VBT_TYPO.bodySm, lineHeight: 1.55 }}>
              Une synthèse rédigée par IA (Claude Haiku) résumera ici la posture SEO du site
              en quelques phrases, et listera les catégories les plus solides et les plus
              problématiques.
            </p>
            <button
              onClick={onRequestAi}
              disabled={busy}
              className="rounded-lg self-start"
              style={{
                background: VBT.terracotta500,
                color: VBT.paper,
                fontWeight: 600,
                fontSize: VBT_TYPO.caption,
                padding: "10px 16px",
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Génération en cours…" : "Générer la synthèse"}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT — radar chart, fills its column */}
      <div className="col-span-6 min-w-0 min-h-0 flex items-center justify-center">
        <div className="w-full h-full" style={{ maxHeight: "100%" }}>
          <RadarChart axes={axes} series={series} />
        </div>
      </div>
    </div>
  );
}

function BestWorstBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ok" | "bad";
}) {
  const palette =
    tone === "ok"
      ? { fg: VBT.good, bg: "#bfe6cd", chip: "#bfe6cd" }
      : { fg: VBT.bad, bg: "#e9b3a4", chip: "#e9b3a4" };
  return (
    <div
      style={{
        background: VBT.paper,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 14,
        boxShadow: hardShadow(3),
        padding: "12px 14px",
      }}
    >
      <div
        className="uppercase mb-2 inline-flex items-center"
        style={{
          color: VBT.ink,
          background: palette.bg,
          border: `1.5px solid ${VBT.ink}`,
          borderRadius: 999,
          padding: "3px 10px",
          fontWeight: 800,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.1em",
          fontFamily: VBT_FONT.title,
        }}
      >
        {title}
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center"
            style={{
              color: VBT.ink,
              background: VBT.cream100,
              border: `1.5px solid ${VBT.ink}`,
              borderRadius: 999,
              padding: "3px 10px",
              fontWeight: 700,
              fontSize: VBT_TYPO.caption,
              fontFamily: VBT_FONT.title,
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// ROBOTS.TXT current/improved — text left + raw file panel right
// ===========================================================================

// Cap on lines actually displayed in the panel. Anything beyond is shown
// via a "+ N lignes" footer so a 500-line legacy robots.txt doesn't blow
// the slide. The improved panel is naturally capped at 30 by the AI.
const FILE_PANEL_MAX_LINES = 60;

function FilePanel({ raw, label }: { raw: string; label: string }) {
  // Render the file in a mono code panel sized to fit the slide WITHOUT
  // scrolling : font size auto-shrinks based on line count so a 15-line
  // file reads big and a 50-line file still fits. Slides are static
  // (no scrollbars in the export), so we never use overflow-y:auto.
  const allLines = (raw || "").split("\n");
  const truncated = allLines.length > FILE_PANEL_MAX_LINES;
  const visibleLines = truncated ? allLines.slice(0, FILE_PANEL_MAX_LINES) : allLines;
  const visibleText = visibleLines.join("\n");
  const n = visibleLines.length || 1;
  // Pick a font size that comfortably fills the ~640px tall panel body
  // (line-height 1.35) without overflow. Linear ladder.
  const fontSize =
    n <= 18 ? 13 :
    n <= 26 ? 12 :
    n <= 34 ? 11 :
    n <= 44 ? 10 :
    n <= 54 ? 9 : 8;
  return (
    <div
      className="rounded-xl flex flex-col min-w-0 min-h-0 overflow-hidden w-full"
      style={{
        background: VBT.paper,
        border: `1.5px solid ${VBT.ink}`,
        boxShadow: hardShadow(4),
      }}
    >
      <div
        className="flex items-center gap-2 shrink-0"
        style={{
          padding: "8px 14px",
          borderBottom: `1px solid ${VBT.paperEdge}`,
          background: VBT.terracotta50,
        }}
      >
        <span
          className="inline-block rounded-full"
          style={{ width: 7, height: 7, background: VBT.terracotta500 }}
        />
        <span
          className="uppercase flex-1"
          style={{
            color: VBT.terracotta700,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.16em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          {label}
        </span>
        <span
          className="tabular-nums"
          style={{
            color: VBT.zinc,
            fontSize: VBT_TYPO.micro,
            fontFamily: VBT_FONT.mono,
          }}
        >
          {allLines.length} lignes
        </span>
      </div>
      <pre
        className="flex-1 min-h-0 overflow-hidden whitespace-pre-wrap"
        style={{
          margin: 0,
          padding: "12px 14px",
          fontFamily: VBT_FONT.mono,
          fontSize,
          lineHeight: 1.35,
          color: VBT.ink,
          background: "#fdfaf4",
        }}
      >
        {visibleText}
      </pre>
      {truncated && (
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            padding: "6px 12px",
            borderTop: `1px dashed ${VBT.paperEdge}`,
            background: VBT.terracotta50,
            color: VBT.terracotta700,
            fontSize: VBT_TYPO.micro,
            fontFamily: VBT_FONT.mono,
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          + {allLines.length - FILE_PANEL_MAX_LINES} lignes (voir XLSX)
        </div>
      )}
    </div>
  );
}

function AiBulletList({
  title,
  items,
  tone = "warn",
}: {
  title: string;
  items: string[];
  tone?: "warn" | "ok";
}) {
  const palette =
    tone === "ok"
      ? { fg: VBT.sigGreen, edge: "#9bc4ad" }
      : { fg: VBT.sigRed, edge: "#e29a8d" };
  return (
    <div className="min-w-0">
      <div
        className="uppercase mb-2"
        style={{
          color: palette.fg,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.18em",
          fontFamily: VBT_FONT.mono,
        }}
      >
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 6).map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-2"
            style={{
              color: VBT.ink,
              fontSize: VBT_TYPO.bodySm,
              lineHeight: 1.5,
              fontFamily: VBT_FONT.body,
            }}
          >
            <span className="shrink-0 mt-1" style={{ color: palette.fg }}>
              <ChevronRightIcon size={11} color={palette.fg} />
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RobotsCurrentBody({
  slide,
  onRequestAi,
  busy,
}: {
  slide: Extract<AdvSlide, { kind: "robots-current" }>;
  onRequestAi: () => void;
  busy: boolean;
}) {
  const hasAi = !!slide.ai_overview;
  return (
    <div className="flex-1 grid grid-cols-12 gap-8 min-h-0 overflow-hidden">
      {/* LEFT — AI analysis */}
      <div className="col-span-7 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <SparklesIcon size={12} color={VBT.terracotta500} />
          Analyse du robots.txt actuel
        </div>

        {hasAi ? (
          <>
            <div
              style={{
                color: VBT.ink,
                fontFamily: VBT_FONT.body,
                fontSize: VBT_TYPO.body,
                lineHeight: 1.55,
                display: "-webkit-box",
                WebkitLineClamp: 8,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {slide.ai_overview}
            </div>
            {slide.ai_issues.length > 0 && (
              <AiBulletList title="Points bloquants" items={slide.ai_issues} tone="warn" />
            )}
          </>
        ) : slide.ai_error ? (
          <div style={{ color: VBT.sigRed, fontSize: VBT_TYPO.bodySm }}>
            Échec de l&apos;analyse : {slide.ai_error}
            <div className="mt-2">
              <button
                onClick={onRequestAi}
                disabled={busy}
                className="rounded-lg"
                style={{
                  background: VBT.terracotta500,
                  color: VBT.paper,
                  fontWeight: 600,
                  fontSize: VBT_TYPO.caption,
                  padding: "8px 14px",
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3 justify-center">
            <p style={{ color: VBT.inkSoft, fontSize: VBT_TYPO.bodySm, lineHeight: 1.55 }}>
              L&apos;analyse IA va passer le robots.txt en revue : héritages anciens (Umbraco,
              Wordfence), règles inutiles, manquements GEO, et recommandera un fichier propre.
            </p>
            <button
              onClick={onRequestAi}
              disabled={busy}
              className="rounded-lg self-start"
              style={{
                background: VBT.terracotta500,
                color: VBT.paper,
                fontWeight: 600,
                fontSize: VBT_TYPO.caption,
                padding: "10px 16px",
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Analyse en cours…" : "Lancer l'analyse IA"}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT — raw robots.txt panel */}
      <div className="col-span-5 min-w-0 min-h-0 flex">
        <FilePanel raw={slide.raw_content} label="robots.txt actuel" />
      </div>
    </div>
  );
}

export function RobotsImprovedBody({
  slide,
}: {
  slide: Extract<AdvSlide, { kind: "robots-improved" }>;
}) {
  return (
    <div className="flex-1 grid grid-cols-12 gap-8 min-h-0 overflow-hidden">
      <div className="col-span-7 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.sigGreen,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <SparklesIcon size={12} color={VBT.sigGreen} />
          Robots.txt recommandé
        </div>
        <div
          style={{
            color: VBT.ink,
            fontFamily: VBT_FONT.body,
            fontSize: VBT_TYPO.body,
            lineHeight: 1.55,
          }}
        >
          Le nouveau fichier est plus court, lisible et maintenable. Voici les changements clés
          apportés par rapport à la version actuelle.
        </div>
        {slide.ai_improvements.length > 0 && (
          <AiBulletList title="Améliorations clés" items={slide.ai_improvements} tone="ok" />
        )}
      </div>
      <div className="col-span-5 min-w-0 min-h-0 flex">
        <FilePanel raw={slide.improved_content || "(en attente de génération)"} label="robots.txt recommandé" />
      </div>
    </div>
  );
}

// ===========================================================================
// SITEMAP — overview + gaps (two slides)
// ===========================================================================

export function SitemapOverviewBody({
  slide,
  onRequestAi,
  busy,
}: {
  slide: Extract<AdvSlide, { kind: "sitemap-overview" }>;
  onRequestAi: () => void;
  busy: boolean;
}) {
  const hasAi = !!slide.ai_overview;
  return (
    <div className="flex-1 grid grid-cols-12 gap-8 min-h-0 overflow-hidden">
      <div className="col-span-7 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <SparklesIcon size={12} color={VBT.terracotta500} />
          Analyse du sitemap.xml
        </div>

        {hasAi ? (
          <>
            <div
              style={{
                color: VBT.ink,
                fontFamily: VBT_FONT.body,
                fontSize: VBT_TYPO.body,
                lineHeight: 1.55,
                display: "-webkit-box",
                WebkitLineClamp: 9,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {slide.ai_overview}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-1">
              <MiniStat label="URLs dans le sitemap" value={slide.url_count.toLocaleString("fr-FR")} tone="info" />
              <MiniStat label="Indexables (crawl)" value={slide.indexable_count.toLocaleString("fr-FR")} tone="ok" />
              <MiniStat
                label="Absentes du sitemap"
                value={slide.missing_count.toLocaleString("fr-FR")}
                tone={slide.missing_count > 0 ? "bad" : "ok"}
              />
            </div>
          </>
        ) : slide.ai_error ? (
          <div style={{ color: VBT.sigRed, fontSize: VBT_TYPO.bodySm }}>
            Échec de l&apos;analyse : {slide.ai_error}
            <div className="mt-2">
              <button
                onClick={onRequestAi}
                disabled={busy}
                className="rounded-lg"
                style={{ background: VBT.terracotta500, color: VBT.paper, padding: "8px 14px", fontWeight: 600, fontSize: VBT_TYPO.caption, cursor: busy ? "wait" : "pointer" }}
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3 justify-center">
            <p style={{ color: VBT.inkSoft, fontSize: VBT_TYPO.bodySm, lineHeight: 1.55 }}>
              L&apos;analyse va récupérer le sitemap (incluant les sitemap-index), recompter ses
              URLs, et identifier les pages indexables du crawl qui n&apos;y figurent pas.
            </p>
            <button
              onClick={onRequestAi}
              disabled={busy}
              className="rounded-lg self-start"
              style={{ background: VBT.terracotta500, color: VBT.paper, padding: "10px 16px", fontWeight: 600, fontSize: VBT_TYPO.caption, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Analyse en cours…" : "Lancer l'analyse IA"}
            </button>
          </div>
        )}
      </div>

      <div className="col-span-5 min-w-0 min-h-0 flex">
        <FilePanel
          raw={`URL : ${slide.sitemap_url}\n${slide.last_modified ? `Last-Modified : ${slide.last_modified}\n` : ""}\nTotal URLs : ${slide.url_count.toLocaleString("fr-FR")}\nIndexables crawl : ${slide.indexable_count.toLocaleString("fr-FR")}\nAbsentes du sitemap : ${slide.missing_count.toLocaleString("fr-FR")}`}
          label="sitemap.xml"
        />
      </div>
    </div>
  );
}

export function SitemapGapsBody({
  slide,
}: {
  slide: Extract<AdvSlide, { kind: "sitemap-gaps" }>;
}) {
  return (
    <div className="flex-1 grid grid-cols-12 gap-8 min-h-0 overflow-hidden">
      <div className="col-span-7 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.sigRed,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <AlertTriangleIcon size={12} color={VBT.sigRed} />
          {slide.missing_count.toLocaleString("fr-FR")} URLs indexables absentes du sitemap
        </div>

        {slide.ai_gaps_summary && (
          <div
            style={{
              color: VBT.ink,
              fontFamily: VBT_FONT.body,
              fontSize: VBT_TYPO.body,
              lineHeight: 1.55,
              display: "-webkit-box",
              WebkitLineClamp: 8,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {slide.ai_gaps_summary}
          </div>
        )}
      </div>

      <div className="col-span-5 min-w-0 min-h-0 flex flex-col gap-2">
        <div
          className="uppercase"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          Répartition des absences
        </div>
        <div
          className="rounded-xl flex-1 min-h-0 overflow-y-auto"
          style={{
            background: VBT.paper,
            border: `1.5px solid ${VBT.ink}`,
            padding: "10px 12px",
          }}
        >
          {slide.breakdown.length === 0 ? (
            <div style={{ color: VBT.zinc, fontSize: VBT_TYPO.bodySm, fontStyle: "italic" }}>
              Aucune absence détectée.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {slide.breakdown.slice(0, 12).map((b, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 min-w-0"
                  style={{ fontSize: VBT_TYPO.bodySm, color: VBT.ink, fontFamily: VBT_FONT.body }}
                >
                  <code
                    className="truncate flex-1 min-w-0"
                    style={{ color: VBT.terracotta700, fontFamily: VBT_FONT.mono, fontSize: VBT_TYPO.bodySm - 1 }}
                  >
                    {b.label}
                  </code>
                  <span
                    className="tabular-nums shrink-0"
                    style={{
                      color: VBT.ink,
                      fontWeight: 700,
                      fontFamily: VBT_FONT.title,
                      fontSize: VBT_TYPO.bodySm,
                    }}
                  >
                    {b.count.toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "info";
}) {
  const palette =
    tone === "ok" ? { fg: VBT.good, bg: "#bfe6cd" } :
    tone === "warn" ? { fg: VBT.warn, bg: VBT.amber200 } :
    tone === "bad" ? { fg: VBT.bad, bg: "#e9b3a4" } :
    { fg: VBT.info, bg: "#c4e1ee" };
  return (
    <div
      className="min-w-0"
      style={{
        background: palette.bg,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 14,
        boxShadow: hardShadow(3),
        padding: "10px 13px",
      }}
    >
      <div
        className="tabular-nums truncate"
        style={{
          color: VBT.ink,
          fontFamily: VBT_FONT.display,
          fontWeight: 800,
          fontSize: 26,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      <div
        className="uppercase truncate mt-1"
        style={{
          color: VBT.ink2,
          fontWeight: 700,
          fontSize: VBT_TYPO.micro,
          letterSpacing: "0.12em",
          fontFamily: VBT_FONT.title,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ===========================================================================
// CUSTOM slide — user-authored free text (title in chrome, body here).
// ===========================================================================

export function CustomSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "custom" }> }) {
  const paragraphs = (slide.body || "").split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden justify-center">
      {paragraphs.length === 0 ? (
        <p style={{ color: VBT.zinc, fontStyle: "italic", fontSize: VBT_TYPO.body }}>
          (Slide vide : ajoute du texte depuis l&apos;éditeur.)
        </p>
      ) : (
        paragraphs.map((p, i) => {
          // Lines starting with "- " or "• " render as a bullet list.
          const lines = p.split("\n");
          const isList = lines.every((l) => /^\s*[-•]\s+/.test(l));
          if (isList) {
            return (
              <ul key={i} className="space-y-2">
                {lines.map((l, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-3"
                    style={{ color: VBT.ink, fontSize: VBT_TYPO.body, lineHeight: 1.55, fontFamily: VBT_FONT.body }}
                  >
                    <span className="shrink-0 mt-1" style={{ color: VBT.terracotta500 }}>
                      <ChevronRightIcon size={13} color={VBT.terracotta500} />
                    </span>
                    <span>{l.replace(/^\s*[-•]\s+/, "")}</span>
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p
              key={i}
              style={{
                color: VBT.ink,
                fontSize: VBT_TYPO.body,
                lineHeight: 1.6,
                fontFamily: VBT_FONT.body,
              }}
            >
              {p}
            </p>
          );
        })
      )}
    </div>
  );
}

export function PrioritySlideBody({
  slide,
  onRequestAi,
  busy,
}: {
  slide: Extract<AdvSlide, { kind: "priority" }>;
  onRequestAi: () => void;
  busy: boolean;
}) {
  const items = slide.items.slice(0, 12);
  // Group by urgency for the kanban lanes
  const groups: Record<PriorityItem["urgency"], PriorityItem[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  items.forEach((p) => groups[p.urgency].push(p));
  const laneOrder: PriorityItem["urgency"][] = ["critical", "high", "medium", "low"];

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
      {/* Kanban lanes */}
      <div className="col-span-8 flex flex-col gap-3 min-w-0 min-h-0">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: VBT.terracotta500 }} />
          Plan d&apos;action · {items.length} chantiers classés par urgence
        </div>
        <div className="flex-1 grid grid-cols-4 gap-3 min-h-0 overflow-hidden">
          {laneOrder.map((urg) => (
            <KanbanLane
              key={urg}
              urgency={urg}
              items={groups[urg]}
            />
          ))}
        </div>
      </div>

      {/* AI synthesis */}
      <div className="col-span-4 flex flex-col gap-2 min-w-0 min-h-0">
        <div
          className="uppercase flex items-center gap-2"
          style={{
            color: VBT.terracotta600,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.18em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          <SparklesIcon size={12} color={VBT.terracotta500} />
          Synthèse consultant
        </div>
        <div
          className="flex-1 rounded-xl relative min-h-0 overflow-y-auto"
          style={{
            background: VBT.paper,
            border: `1.5px solid ${VBT.ink}`,
            color: VBT.inkSoft,
            boxShadow: hardShadow(4),
            padding: "18px 20px",
            fontSize: VBT_TYPO.bodySm,
            lineHeight: 1.6,
          }}
        >
          <span
            aria-hidden
            className="absolute pointer-events-none select-none"
            style={{
              top: 8,
              left: 10,
              color: VBT.terracotta500,
              opacity: 0.25,
            }}
          >
            <QuoteIcon size={28} color={VBT.terracotta500} />
          </span>
          <div style={{ paddingLeft: 22, paddingTop: 4 }}>
            {slide.ai_summary ? (
              <p
                style={{
                  whiteSpace: "pre-wrap",
                  display: "-webkit-box",
                  WebkitLineClamp: 14,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {renderRichText(slide.ai_summary)}
              </p>
            ) : slide.ai_summary_error ? (
              <>
                <p style={{ color: VBT.sigRed }} className="mb-2">
                  Échec de la génération IA : {slide.ai_summary_error}
                </p>
                <button
                  onClick={onRequestAi}
                  disabled={busy}
                  className="underline"
                  style={{ color: VBT.terracotta700, fontSize: VBT_TYPO.caption }}
                >
                  Réessayer
                </button>
              </>
            ) : busy ? (
              <p style={{ color: VBT.inkSoft }}>Synthèse en cours…</p>
            ) : (
              <>
                <p className="mb-3">
                  Une synthèse rédigée par IA (Claude Haiku) résumera ici les priorités à traiter, en s&apos;appuyant sur les scores et compteurs du rapport. Aucune URL n&apos;est transmise : seuls les chiffres agrégés.
                </p>
                <button
                  onClick={onRequestAi}
                  disabled={busy}
                  className="rounded-lg"
                  style={{
                    background: VBT.terracotta500,
                    color: VBT.paper,
                    fontWeight: 600,
                    fontSize: VBT_TYPO.caption,
                    padding: "8px 14px",
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  Générer la synthèse
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanLane({ urgency, items }: { urgency: PriorityItem["urgency"]; items: PriorityItem[] }) {
  const palette = URGENCY_PALETTE[urgency];
  const Icon = URGENCY_ICON[urgency];
  return (
    <div
      className="overflow-hidden flex flex-col min-w-0 min-h-0"
      style={{
        background: palette.soft,
        border: `1.5px solid ${VBT.ink}`,
        borderRadius: 16,
        boxShadow: hardShadow(4),
      }}
    >
      <div
        className="flex items-center gap-2 shrink-0"
        style={{
          background: VBT.paper,
          borderBottom: `1px solid ${palette.edge}`,
          padding: "10px 12px",
        }}
      >
        <span className="shrink-0" style={{ color: palette.fg }}>
          <Icon size={14} color={palette.fg} />
        </span>
        <div
          className="uppercase truncate"
          style={{
            color: palette.label,
            fontWeight: 700,
            fontSize: VBT_TYPO.micro,
            letterSpacing: "0.14em",
            fontFamily: VBT_FONT.mono,
          }}
        >
          {URGENCY_LABEL[urgency]}
        </div>
        <span
          className="ml-auto tabular-nums shrink-0 inline-flex items-center justify-center rounded-full"
          style={{
            background: palette.fg,
            color: VBT.paper,
            minWidth: 18,
            height: 18,
            fontSize: 10,
            fontWeight: 800,
            padding: "0 5px",
          }}
        >
          {items.length}
        </span>
      </div>
      <div className="flex-1 overflow-hidden min-h-0 p-2 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <div
            className="flex-1 flex items-center justify-center text-center"
            style={{
              color: VBT.zinc,
              fontSize: VBT_TYPO.caption,
              fontStyle: "italic",
              padding: 8,
            }}
          >
            Aucun chantier
          </div>
        ) : (
          <>
            {items.slice(0, 5).map((p) => <KanbanCard key={p.rank} item={p} palette={palette} />)}
            {items.length > 5 && (
              <div
                className="text-center"
                style={{ color: palette.label, fontSize: VBT_TYPO.micro, fontWeight: 700, fontFamily: VBT_FONT.mono, paddingTop: 2 }}
              >
                + {items.length - 5} autres
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  item,
  palette,
}: {
  item: PriorityItem;
  palette: { fg: string; soft: string; edge: string; label: string };
}) {
  const effortLabel =
    item.effort === "quick-win" ? "Action rapide" :
    item.effort === "medium" ? "Effort modéré" : "Chantier de fond";
  return (
    <div
      className="min-w-0"
      style={{
        background: VBT.paper,
        border: `1.5px solid ${VBT.ink}`,
        borderLeft: `5px solid ${palette.fg}`,
        borderRadius: 10,
        boxShadow: hardShadow(2),
        padding: "8px 10px",
      }}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <span
          className="shrink-0 inline-flex items-center justify-center tabular-nums"
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: palette.fg,
            color: VBT.paper,
            fontSize: 9,
            fontWeight: 800,
            fontFamily: VBT_FONT.title,
          }}
        >
          {item.rank}
        </span>
        <div
          className="text-[11px] flex-1 min-w-0"
          style={{
            color: VBT.ink,
            fontWeight: 600,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={item.title}
        >
          {item.title}
        </div>
      </div>
      <div
        className="tabular-nums truncate mt-1"
        style={{ color: VBT.zinc, fontSize: 10 }}
      >
        <strong style={{ color: VBT.inkSoft, fontWeight: 700 }}>
          {item.affected.toLocaleString("fr-FR")}
        </strong>{" "}URLs · {effortLabel}
      </div>
    </div>
  );
}

// ===========================================================================
// Utility
// ===========================================================================

function renderRichText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const m = p.match(/^\*\*(.+)\*\*$/);
    if (m) {
      return (
        <strong
          key={i}
          style={{ color: VBT.terracotta700, fontWeight: 700 }}
        >
          {m[1]}
        </strong>
      );
    }
    return p.replace(/\*([^*]+)\*/g, "$1");
  });
}

function shortenUrl(u: string, max = 50): string {
  try {
    const p = new URL(u);
    const path = p.pathname === "/" ? "" : p.pathname;
    const display = (p.hostname.replace(/^www\./, "") + path).replace(/\/$/, "");
    return display.length > max ? display.slice(0, max - 1) + "…" : display;
  } catch {
    return u.length > max ? u.slice(0, max - 1) + "…" : u;
  }
}
