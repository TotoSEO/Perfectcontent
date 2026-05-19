"use client";

import { VBT } from "@/lib/audit/brand";
import { BarChart, DonutChart, Histogram } from "../Charts";
import { SectionPill } from "./AdvSlide";
import { RecoIcon, iconForReco } from "./RecoIcons";
import type { AdvKPI, AdvSlide, AnchorDestinationSummary, PriorityItem } from "@/lib/audit/advanced/types";

const KPI_PALETTES = {
  ok:   { bg: "#EAF2E0", text: VBT.good,         border: "#C6D9B0" },
  warn: { bg: VBT.amber50, text: VBT.amber600,    border: "#E5CD83" },
  bad:  { bg: VBT.brick50, text: VBT.brick500,    border: "#E5BDB5" },
  info: { bg: VBT.terracotta50, text: VBT.terracotta700, border: "#F5D5BA" },
} as const;

export function AdvKpiTile({ kpi, size = "md" }: { kpi: AdvKPI; size?: "sm" | "md" }) {
  const palette = KPI_PALETTES[kpi.tone || "ok"];
  return (
    <div
      className={`rounded-xl border ${size === "sm" ? "px-3 py-2" : "px-3.5 py-2.5"}`}
      style={{ background: palette.bg, borderColor: palette.border }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.14em] truncate"
        style={{ color: VBT.zinc, fontWeight: 600 }}
        title={kpi.label}
      >
        {kpi.label}
      </div>
      <div
        className={`tabular-nums mt-0.5 leading-tight ${size === "sm" ? "text-base" : "text-xl"}`}
        style={{
          color: palette.text,
          fontWeight: 700,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
        }}
      >
        {kpi.value}
      </div>
    </div>
  );
}

export function XlsxRefBadge({ sheet }: { sheet: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px]"
      style={{
        background: VBT.terracotta50,
        border: `1px solid ${VBT.terracotta500}`,
        color: VBT.terracotta700,
        fontWeight: 600,
      }}
    >
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded text-[10px]"
        style={{ background: VBT.terracotta500, color: VBT.paper, fontWeight: 800 }}
      >
        ⎘
      </span>
      <span>
        Voir l'onglet&nbsp;
        <strong style={{ color: VBT.terracotta700 }}>« {sheet} »</strong>&nbsp;du fichier XLSX
      </span>
    </div>
  );
}

export function NoIssuesBlock() {
  return (
    <div
      className="flex-1 flex items-center justify-center rounded-xl text-sm"
      style={{
        border: `1px dashed #C6D9B0`,
        background: "#F0F6E8",
        color: VBT.good,
        fontWeight: 600,
        minHeight: 80,
      }}
    >
      ✓ Aucun problème détecté dans cette catégorie
    </div>
  );
}

export function DescriptionBlock({ text, maxLines = 6 }: { text: string; maxLines?: number }) {
  return (
    <p
      className="text-[13px] leading-relaxed whitespace-pre-line"
      style={{
        color: VBT.inkSoft,
        // Cap height to prevent overflow; SF descriptions are bounded so this
        // just gives a safe rendering ceiling on very small slide sizes.
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

export function ChartContainer({
  children,
  maxWidth = 320,
}: {
  children: React.ReactNode;
  maxWidth?: number | string;
}) {
  return (
    <div
      className="rounded-xl p-3 overflow-hidden w-full"
      style={{
        background: VBT.paper,
        border: `1px solid ${VBT.paperEdge}`,
        maxWidth,
        boxShadow: "0 4px 12px -10px rgba(36,23,18,0.2)",
      }}
    >
      {children}
    </div>
  );
}

// ===========================================================================
// SLIDE CONTENT VARIANTS
// ===========================================================================

export function DataSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "data" }> }) {
  const hasIssues = slide.issues_count > 0;
  const hasChart = !!slide.chart;
  // "Sparse" = no chart AND at most 2 KPIs. Pages like "H1 en double",
  // "Meta descriptions en double" only have a single count to report and
  // were leaving the whole bottom half empty. We render them with a
  // centered hero layout that gives the figure proper visual weight.
  const isSparse = !hasChart && slide.kpis.length <= 2;

  if (isSparse) {
    return <SparseSlideBody slide={slide} />;
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Top: description (with left accent) + xlsx ref */}
      <div className="flex items-start gap-4 min-w-0">
        <div
          className="flex-1 min-w-0 pl-3 rounded-r-md"
          style={{ borderLeft: `3px solid ${VBT.terracotta500}` }}
        >
          <DescriptionBlock text={slide.description} maxLines={4} />
        </div>
        {hasIssues && slide.xlsx_sheet && (
          <div className="shrink-0">
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}
      </div>

      {/* Middle: KPIs on the left, chart on the right (when both present);
          full-width KPIs when no chart, full-width chart when no KPIs. */}
      <div className="flex-1 grid gap-4 min-h-0 overflow-hidden" style={{ gridTemplateColumns: hasChart ? "minmax(0, 5fr) minmax(0, 7fr)" : "1fr" }}>
        <div className="flex flex-col gap-2 min-w-0">
          <div
            className={`grid gap-2 ${hasChart ? "grid-cols-2" : slide.kpis.length <= 2 ? "grid-cols-2" : slide.kpis.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}
          >
            {slide.kpis.map((k, i) => (
              <AdvKpiTile key={i} kpi={k} size={hasChart ? "sm" : "md"} />
            ))}
          </div>
          {/* Takeaway under KPIs, only when no chart so the slide stays balanced */}
          {!hasChart && slide.takeaway && (
            <div
              className="mt-1 rounded-lg px-4 py-2 text-[12px] flex items-start gap-2"
              style={{
                background: VBT.terracotta50,
                color: VBT.terracotta700,
                border: `1px solid ${VBT.terracotta100}`,
                fontWeight: 500,
              }}
            >
              <span style={{ color: VBT.terracotta500 }}>►</span>
              <span>{slide.takeaway}</span>
            </div>
          )}
        </div>

        {hasChart && (
          <div className="flex flex-col gap-2 min-w-0 min-h-0">
            <div
              className="text-[10px] uppercase tracking-[0.16em] flex items-center gap-2"
              style={{ color: VBT.terracotta600, fontWeight: 700 }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: VBT.terracotta500 }} />
              {chartCaption(slide.chart!.type)}
            </div>
            <ChartContainer maxWidth="100%">
              {slide.chart!.type === "donut" && (
                <DonutChart segments={slide.chart!.segments} size={170} thickness={26} />
              )}
              {slide.chart!.type === "bar" && (
                <BarChart bars={slide.chart!.bars} max={slide.chart!.max} width={460} barHeight={20} gap={4} />
              )}
              {slide.chart!.type === "histogram" && (
                <Histogram bins={slide.chart!.bins} height={130} />
              )}
            </ChartContainer>
            {/* When the chart is shown, takeaway goes underneath it so it has
                the visual weight of a conclusion. */}
            {slide.takeaway && (
              <div
                className="rounded-lg px-3 py-1.5 text-[11.5px] flex items-start gap-2"
                style={{
                  background: VBT.terracotta50,
                  color: VBT.terracotta700,
                  border: `1px solid ${VBT.terracotta100}`,
                  fontWeight: 500,
                }}
              >
                <span style={{ color: VBT.terracotta500 }}>►</span>
                <span>{slide.takeaway}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* No-issue ribbon when there's neither chart nor takeaway */}
      {!hasChart && !slide.takeaway && !hasIssues && (
        <NoIssuesBlock />
      )}
    </div>
  );
}

// Layout used for slides with a single takeaway figure ("Title dupliqués",
// "Meta dupliquées", "H1 en double"…). Splits the slide vertically: text
// on the left, hero KPI on the right with a decorative ring around it.
function SparseSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "data" }> }) {
  const hasIssues = slide.issues_count > 0;
  const heroKpi = slide.kpis[0];
  const secondaryKpi = slide.kpis[1];
  // Pick a tone for the hero ring based on the headline KPI's status.
  const ring =
    heroKpi?.tone === "bad" ? { fill: VBT.brick500, soft: VBT.brick50, ringEdge: "#E5BDB5" } :
    heroKpi?.tone === "warn" ? { fill: VBT.amber500, soft: VBT.amber50, ringEdge: "#E5CD83" } :
    heroKpi?.tone === "info" ? { fill: VBT.terracotta500, soft: VBT.terracotta50, ringEdge: "#F5D5BA" } :
    { fill: VBT.good, soft: "#EAF2E0", ringEdge: "#C6D9B0" };

  return (
    <div className="flex-1 grid grid-cols-12 gap-8 min-h-0 items-center pb-2">
      {/* Left: description + xlsx + takeaway, stacked and vertically centered */}
      <div className="col-span-7 flex flex-col gap-4 min-w-0">
        <div
          className="pl-4 rounded-r-md"
          style={{ borderLeft: `3px solid ${VBT.terracotta500}` }}
        >
          <DescriptionBlock text={slide.description} maxLines={8} />
        </div>

        {hasIssues && slide.xlsx_sheet && (
          <div>
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}

        {slide.takeaway && (
          <div
            className="rounded-lg px-4 py-2.5 text-[13px] flex items-start gap-2"
            style={{
              background: VBT.terracotta50,
              color: VBT.terracotta700,
              border: `1px solid ${VBT.terracotta100}`,
              fontWeight: 500,
            }}
          >
            <span style={{ color: VBT.terracotta500 }}>►</span>
            <span>{slide.takeaway}</span>
          </div>
        )}
      </div>

      {/* Right: hero figure */}
      <div className="col-span-5 flex items-center justify-center min-w-0">
        {heroKpi ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: 220,
                height: 220,
                background: ring.soft,
                border: `1px solid ${ring.ringEdge}`,
                boxShadow: "0 16px 40px -20px rgba(36, 23, 18, 0.3)",
              }}
            >
              <span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  width: 180,
                  height: 180,
                  background: VBT.paper,
                  border: `1px solid ${ring.ringEdge}`,
                }}
              />
              <div className="relative flex flex-col items-center justify-center" style={{ width: 180, height: 180 }}>
                <div
                  className="tabular-nums"
                  style={{
                    color: ring.fill,
                    fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 56,
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  {heroKpi.value}
                </div>
                <div
                  className="mt-2 px-3 text-center text-[11px] uppercase tracking-[0.16em]"
                  style={{ color: VBT.inkSoft, fontWeight: 600 }}
                >
                  {heroKpi.label}
                </div>
              </div>
            </div>
            {secondaryKpi && (
              <div
                className="rounded-lg px-3 py-1.5 text-center"
                style={{
                  background: VBT.paper,
                  border: `1px solid ${VBT.paperEdge}`,
                  minWidth: 180,
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: VBT.zinc, fontWeight: 600 }}
                >
                  {secondaryKpi.label}
                </div>
                <div
                  className="tabular-nums"
                  style={{
                    color: VBT.ink,
                    fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: 18,
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

export function InfoSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "info" }> }) {
  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <DescriptionBlock text={slide.description} maxLines={10} />

      {slide.facts && slide.facts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-1">
          {slide.facts.map((f, i) => (
            <div
              key={i}
              className="rounded-xl px-4 py-3"
              style={{
                background: VBT.terracotta50,
                border: `1px solid ${VBT.terracotta100}`,
              }}
            >
              <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: VBT.zinc, fontWeight: 600 }}>
                {f.label}
              </div>
              <div
                className="text-lg mt-1"
                style={{
                  color: VBT.terracotta700,
                  fontWeight: 700,
                  fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                }}
              >
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {slide.callout && (
        <div
          className="mt-auto rounded-xl p-4"
          style={{
            background: slide.callout.tone === "warn" ? VBT.amber50 : VBT.terracotta50,
            border: `1px solid ${slide.callout.tone === "warn" ? VBT.amber200 : VBT.terracotta200}`,
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.18em] mb-1"
            style={{ color: slide.callout.tone === "warn" ? VBT.amber700 : VBT.terracotta700, fontWeight: 700 }}
          >
            ⚠ {slide.callout.title}
          </div>
          <div className="text-[12px]" style={{ color: VBT.inkSoft, lineHeight: 1.5 }}>
            {slide.callout.body}
          </div>
        </div>
      )}
    </div>
  );
}

export function SectionCoverBody({ slide, partOf }: { slide: Extract<AdvSlide, { kind: "section-cover" }>; partOf: string }) {
  return (
    <div className="flex-1 flex items-center gap-10 min-h-0">
      <div className="flex-1 min-w-0 max-w-2xl">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex items-center justify-center rounded-xl"
            style={{
              width: 56,
              height: 56,
              background: VBT.terracotta50,
              border: `1px solid #F5D5BA`,
              boxShadow: "0 4px 16px -10px rgba(196, 107, 48, 0.5)",
            }}
          >
            <RecoIcon name={slide.icon} size={32} />
          </span>
          <div>
            <div
              className="text-[11px] uppercase tracking-[0.28em]"
              style={{ color: VBT.terracotta600, fontWeight: 700 }}
            >
              {slide.eyebrow}
            </div>
            <div
              className="text-[13px]"
              style={{ color: VBT.zinc, fontWeight: 500, fontStyle: "italic" }}
            >
              {partOf}
            </div>
          </div>
        </div>
        <h1
          className="leading-[1.02] mt-2"
          style={{
            fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 64,
            letterSpacing: "-0.028em",
            color: VBT.ink,
          }}
        >
          {slide.title}
        </h1>
        <div
          className="mt-2 h-1 rounded-full"
          style={{
            width: 96,
            background: `linear-gradient(90deg, ${VBT.terracotta600}, ${VBT.amber400})`,
          }}
        />
        <ul className="mt-8 space-y-3">
          {slide.bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-3.5 text-[16px]"
              style={{ color: VBT.ink }}
            >
              <span
                className="inline-flex items-center justify-center shrink-0 mt-0.5 tabular-nums"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: VBT.terracotta500,
                  color: VBT.paper,
                  fontWeight: 800,
                  fontSize: 11,
                  fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontWeight: 500, lineHeight: 1.45 }}>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Decorative side panel: large iconic shape on a tinted card */}
      <div className="hidden md:flex shrink-0 items-center justify-center pl-6">
        <div
          className="relative rounded-2xl flex items-center justify-center"
          style={{
            width: 220,
            height: 220,
            background: `linear-gradient(135deg, ${VBT.terracotta50} 0%, ${VBT.amber50} 100%)`,
            border: `1px solid #F5D5BA`,
            boxShadow: "0 16px 32px -16px rgba(36, 23, 18, 0.25)",
          }}
        >
          {/* Layered concentric rings for depth */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: 180,
              height: 180,
              border: `1px solid ${VBT.terracotta100}`,
              opacity: 0.6,
            }}
          />
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: 140,
              height: 140,
              background: VBT.paper,
              border: `1px solid #F5D5BA`,
              boxShadow: "0 4px 16px -6px rgba(196, 107, 48, 0.2)",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <RecoIcon name={slide.icon} size={64} />
          </div>
          {/* Brand accent dots in corners */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{ top: 14, right: 14, width: 8, height: 8, background: VBT.terracotta500 }}
          />
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{ bottom: 14, left: 14, width: 6, height: 6, background: VBT.amber400 }}
          />
        </div>
      </div>
    </div>
  );
}

export function RecoSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "reco" }> }) {
  // Visual rule: 1-2 reco groups get one row; 3-4 go in a 2×2 grid; 5-6 go
  // in 3×2. We cap items per card to keep cards balanced and the slide
  // overall readable in 16:9.
  const count = slide.groups.length;
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3;
  const maxItemsPerCard = count <= 2 ? 6 : count <= 4 ? 4 : 3;

  return (
    <div
      className="flex-1 grid gap-3 min-h-0 overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
      }}
    >
      {slide.groups.map((g, i) => (
        <RecoCard
          key={i}
          subLabel={g.sub_label}
          items={g.items.slice(0, maxItemsPerCard)}
          accentIndex={i}
        />
      ))}
    </div>
  );
}

// A reco card: header band with icon + title, soft body with bulleted
// actions. Each card alternates between two soft tints so the slide reads
// as a curated grid rather than a wall of text.
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
    ? { bg: VBT.terracotta50, accent: VBT.terracotta600, accentSoft: VBT.terracotta500, edge: "#F5D5BA" }
    : { bg: VBT.amber50, accent: VBT.amber600, accentSoft: VBT.amber500, edge: "#E5CD83" };
  const iconKey = iconForReco(subLabel);
  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col min-w-0"
      style={{
        background: tint.bg,
        border: `1px solid ${tint.edge}`,
        boxShadow: "0 4px 12px -8px rgba(36, 23, 18, 0.18)",
      }}
    >
      {/* Header band */}
      <div
        className="px-3 py-2 flex items-center gap-2 min-w-0"
        style={{
          background: VBT.paper,
          borderBottom: `1px solid ${tint.edge}`,
        }}
      >
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-lg"
          style={{
            width: 32,
            height: 32,
            background: tint.bg,
            border: `1px solid ${tint.edge}`,
          }}
        >
          <RecoIcon name={iconKey} size={20} />
        </span>
        <div className="min-w-0">
          <div
            className="text-[12px] truncate"
            style={{
              fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
              color: tint.accent,
              fontWeight: 700,
              letterSpacing: "-0.005em",
            }}
            title={subLabel}
          >
            {subLabel}
          </div>
        </div>
      </div>

      {/* Items */}
      <ul className="flex-1 px-3 py-2 space-y-1.5 overflow-hidden min-h-0">
        {items.map((item, j) => (
          <li
            key={j}
            className="flex items-start gap-1.5 text-[11px]"
            style={{ color: VBT.ink, lineHeight: 1.45 }}
          >
            <span
              className="shrink-0 mt-1 inline-block rounded-full"
              style={{
                width: 5,
                height: 5,
                background: tint.accentSoft,
              }}
            />
            <span style={{ fontWeight: 400 }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Anchor bar chart — top concentrated destinations with their top anchors.
export function AnchorBarsBody({ slide }: { slide: Extract<AdvSlide, { kind: "anchor-bars" }> }) {
  const hasData = slide.destinations.length > 0;
  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="flex items-start justify-between gap-4 min-w-0">
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
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
          {slide.destinations.slice(0, 6).map((d, i) => {
            const max = Math.max(1, ...d.anchors.map((a) => a.count));
            return (
              <div
                key={i}
                className="rounded-xl p-3 min-w-0"
                style={{ border: `1px solid ${VBT.paperEdge}`, background: VBT.paper }}
              >
                <div
                  className="text-[11px] truncate mb-2"
                  style={{ color: VBT.terracotta700, fontWeight: 600 }}
                  title={d.destination}
                >
                  → {shortenUrl(d.destination)}
                </div>
                <div className="space-y-1">
                  {d.anchors.map((a, j) => {
                    const w = (a.count / max) * 100;
                    const labelInside = w >= 24;
                    return (
                      <div key={j} className="flex items-center gap-2 text-[11px] min-w-0">
                        <div
                          className="w-28 truncate shrink-0 text-right"
                          style={{ color: VBT.inkSoft }}
                          title={a.text}
                        >
                          {a.text || "(vide)"}
                        </div>
                        <div
                          className="relative flex-1 rounded overflow-hidden min-w-0"
                          style={{ height: 16, background: VBT.paperEdge + "55" }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded"
                            style={{
                              width: `${w}%`,
                              background: `linear-gradient(180deg, ${VBT.terracotta400}EE, ${VBT.terracotta500})`,
                            }}
                          />
                          <div
                            className="absolute inset-y-0 flex items-center text-[10px] tabular-nums font-semibold pointer-events-none"
                            style={{
                              left: labelInside ? 6 : `calc(${w}% + 6px)`,
                              color: labelInside ? VBT.paper : VBT.ink,
                            }}
                          >
                            {a.count}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Anchor diversity table — destinations ranked by lowest diversity ratio.
export function AnchorTableBody({ slide }: { slide: Extract<AdvSlide, { kind: "anchor-table" }> }) {
  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="flex items-start justify-between gap-4 min-w-0">
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
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${VBT.paperEdge}` }}
        >
          <table className="w-full text-[11px] table-fixed">
            <colgroup>
              <col style={{ width: "40%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead style={{ background: VBT.terracotta50 }}>
              <tr>
                {["Page de destination", "Liens entrants", "Ancres uniques", "Diversité", "Ancre dominante"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-2.5 py-2 uppercase tracking-[0.1em] text-[10px]"
                    style={{ color: VBT.terracotta700, fontWeight: 700 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slide.rows.map((r, i) => (
                <AnchorRow key={i} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnchorRow({ row }: { row: AnchorDestinationSummary }) {
  const div = row.diversity_ratio;
  const divTone =
    div < 0.2 ? { fg: VBT.brick500, bg: VBT.brick50 } :
    div < 0.5 ? { fg: VBT.amber600, bg: VBT.amber50 } :
    { fg: VBT.good, bg: "#EAF2E0" };
  return (
    <tr style={{ borderTop: `1px solid ${VBT.paperEdge}` }}>
      <td className="px-2.5 py-1.5 truncate" style={{ color: VBT.ink }} title={row.destination}>
        {shortenUrl(row.destination)}
      </td>
      <td className="px-2.5 py-1.5 tabular-nums" style={{ color: VBT.inkSoft }}>{row.inlinks_count}</td>
      <td className="px-2.5 py-1.5 tabular-nums" style={{ color: VBT.inkSoft }}>{row.unique_anchors}</td>
      <td className="px-2.5 py-1.5">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] tabular-nums"
          style={{ background: divTone.bg, color: divTone.fg, fontWeight: 700 }}
        >
          {div.toFixed(2)}
        </span>
      </td>
      <td className="px-2.5 py-1.5 truncate" style={{ color: VBT.ink }} title={row.dominant_anchor}>
        <span className="truncate">{row.dominant_anchor || "—"}</span>
        <span className="ml-1.5 text-[10px] tabular-nums" style={{ color: VBT.zinc }}>
          ({row.dominant_anchor_pct}%)
        </span>
      </td>
    </tr>
  );
}

// ===========================================================================
// Priority slide (deterministic items + AI narrative)
// ===========================================================================

const URGENCY_LABEL: Record<PriorityItem["urgency"], string> = {
  critical: "Critique",
  high: "Haute",
  medium: "Moyenne",
  low: "Basse",
};

export function PrioritySlideBody({
  slide,
  onRequestAi,
  busy,
}: {
  slide: Extract<AdvSlide, { kind: "priority" }>;
  onRequestAi: () => void;
  busy: boolean;
}) {
  // Show the top 10 — fits cleanly in the slide height without scrolling
  // and still captures the bulk of the actionable findings.
  const items = slide.items.slice(0, 10);
  return (
    <div className="flex-1 grid grid-cols-12 gap-5 min-h-0 overflow-hidden">
      {/* Left column — priorities */}
      <div className="col-span-7 flex flex-col gap-2 min-w-0">
        <div
          className="text-[10px] uppercase tracking-[0.18em] flex items-center gap-2"
          style={{ color: VBT.terracotta600, fontWeight: 700 }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: VBT.terracotta500 }}
          />
          Top 10 chantiers · classés sévérité × volume × poids SEO
        </div>
        <div className="space-y-1 min-h-0 overflow-hidden">
          {items.map((p) => (
            <PriorityRow key={p.rank} item={p} />
          ))}
        </div>
      </div>

      {/* Right column — AI synthesis */}
      <div className="col-span-5 flex flex-col gap-2 min-w-0 min-h-0">
        <div
          className="text-[10px] uppercase tracking-[0.18em] flex items-center gap-2"
          style={{ color: VBT.terracotta600, fontWeight: 700 }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: VBT.terracotta500 }}
          />
          Synthèse consultant
        </div>
        <div
          className="flex-1 rounded-xl p-3.5 text-[12px] leading-relaxed min-h-0 overflow-y-auto relative"
          style={{
            background: VBT.paper,
            border: `1px solid ${VBT.paperEdge}`,
            color: VBT.inkSoft,
            boxShadow: "0 4px 16px -10px rgba(36, 23, 18, 0.16)",
          }}
        >
          {/* Decorative top-left quote mark */}
          <span
            aria-hidden
            className="absolute top-1 left-2 text-3xl leading-none pointer-events-none select-none"
            style={{
              color: VBT.terracotta500,
              opacity: 0.35,
              fontFamily: "var(--font-vbt-title), serif",
              fontWeight: 700,
            }}
          >
            "
          </span>
          <div className="pl-4">
            {slide.ai_summary ? (
              <p style={{ whiteSpace: "pre-wrap" }}>{renderRichText(slide.ai_summary)}</p>
            ) : slide.ai_summary_error ? (
              <>
                <p style={{ color: VBT.brick500 }} className="mb-2">
                  Échec de la génération IA : {slide.ai_summary_error}
                </p>
                <button onClick={onRequestAi} disabled={busy} className="btn-ghost text-xs underline" style={{ color: VBT.terracotta700 }}>
                  Réessayer
                </button>
              </>
            ) : busy ? (
              <p style={{ color: VBT.inkSoft }}>Synthèse en cours…</p>
            ) : (
              <>
                <p className="mb-3">
                  Une synthèse rédigée par IA (Claude Haiku) résumera ici les priorités à traiter, en s'appuyant sur les scores et compteurs du rapport. Aucune URL n'est transmise — seuls les chiffres agrégés.
                </p>
                <button
                  onClick={onRequestAi}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-[11px]"
                  style={{
                    background: VBT.terracotta500,
                    color: VBT.paper,
                    fontWeight: 600,
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

function PriorityRow({ item }: { item: PriorityItem }) {
  const urgencyPalette =
    item.urgency === "critical" ? { bg: VBT.brick500, fg: VBT.paper, soft: VBT.brick50, softFg: VBT.brick500, border: "#E5BDB5" } :
    item.urgency === "high" ?     { bg: VBT.terracotta600, fg: VBT.paper, soft: "#FBE9D6", softFg: VBT.terracotta700, border: "#F5D5BA" } :
    item.urgency === "medium" ?   { bg: VBT.amber500, fg: VBT.paper, soft: VBT.amber50, softFg: VBT.amber600, border: "#E5CD83" } :
                                  { bg: VBT.zinc, fg: VBT.paper, soft: VBT.paperEdge, softFg: VBT.inkSoft, border: VBT.paperEdge };

  const effortLabel =
    item.effort === "quick-win" ? "Action rapide" :
    item.effort === "medium" ? "Effort modéré" : "Chantier de fond";
  const impactLabel = item.impact === "high" ? "Fort impact" : item.impact === "medium" ? "Impact moyen" : "Faible impact";

  return (
    <div
      className="rounded-lg px-2.5 py-1.5 flex items-center gap-2.5 min-w-0"
      style={{
        background: VBT.paper,
        border: `1px solid ${VBT.paperEdge}`,
        borderLeft: `3px solid ${urgencyPalette.bg}`,
      }}
    >
      <div
        className="shrink-0 inline-flex items-center justify-center tabular-nums"
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: urgencyPalette.bg,
          color: urgencyPalette.fg,
          fontSize: 12,
          fontWeight: 800,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
        }}
      >
        {item.rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[12px] truncate"
            style={{ color: VBT.ink, fontWeight: 600 }}
            title={item.title}
          >
            {item.title}
          </span>
          <span
            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
            style={{
              background: urgencyPalette.soft,
              color: urgencyPalette.softFg,
              fontWeight: 700,
            }}
          >
            {URGENCY_LABEL[item.urgency]}
          </span>
        </div>
        <div className="text-[10px] mt-0.5 truncate" style={{ color: VBT.zinc }}>
          <strong className="tabular-nums" style={{ color: VBT.inkSoft }}>{item.affected.toLocaleString("fr-FR")}</strong>{" "}URLs · {effortLabel} · {impactLabel}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Utility
// ===========================================================================

// Render `**bold**` segments as styled <strong> spans (the Haiku prompt now
// forbids Markdown, but older audits already in the DB still carry the
// asterisks — rendering them properly keeps the slide legible without
// requiring a re-generate).
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
    // Strip any remaining single-asterisk emphasis too.
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
