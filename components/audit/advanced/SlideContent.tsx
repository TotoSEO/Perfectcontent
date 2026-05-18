"use client";

import { VBT } from "@/lib/audit/brand";
import { BarChart, DonutChart, Histogram } from "../Charts";
import { SectionPill } from "./AdvSlide";
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

export function ChartContainer({ children, maxWidth = 320 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div
      className="rounded-xl p-3 overflow-hidden"
      style={{
        background: VBT.paper,
        border: `1px solid ${VBT.paperEdge}`,
        maxWidth,
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

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Top description + xlsx badge */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="flex-1 min-w-0">
          <DescriptionBlock text={slide.description} maxLines={4} />
        </div>
        {hasIssues && slide.xlsx_sheet && (
          <div className="shrink-0">
            <XlsxRefBadge sheet={slide.xlsx_sheet} />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div
        className={`grid gap-2.5 ${slide.kpis.length <= 2 ? "grid-cols-2" : slide.kpis.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}
      >
        {slide.kpis.map((k, i) => (
          <AdvKpiTile key={i} kpi={k} />
        ))}
      </div>

      {/* Chart */}
      {hasChart && (
        <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden pt-1">
          <ChartContainer maxWidth={slide.chart!.type === "donut" ? 460 : 540}>
            {slide.chart!.type === "donut" && (
              <DonutChart segments={slide.chart!.segments} size={180} thickness={28} />
            )}
            {slide.chart!.type === "bar" && (
              <BarChart bars={slide.chart!.bars} max={slide.chart!.max} width={500} barHeight={22} gap={4} />
            )}
            {slide.chart!.type === "histogram" && (
              <Histogram bins={slide.chart!.bins} height={140} />
            )}
          </ChartContainer>
        </div>
      )}

      {/* No-issue ribbon when there's no chart */}
      {!hasChart && !hasIssues && (
        <div className="pt-1"><NoIssuesBlock /></div>
      )}

      {/* Takeaway */}
      {slide.takeaway && (
        <div
          className="rounded-lg px-4 py-2 text-[12px]"
          style={{
            background: VBT.terracotta50,
            color: VBT.terracotta700,
            border: `1px solid ${VBT.terracotta100}`,
            fontWeight: 500,
          }}
        >
          {slide.takeaway}
        </div>
      )}
    </div>
  );
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
    <div className="flex-1 flex flex-col justify-center min-h-0 max-w-3xl">
      <div
        className="text-[11px] uppercase tracking-[0.28em]"
        style={{ color: VBT.terracotta600, fontWeight: 700 }}
      >
        {slide.eyebrow}
      </div>
      <h1
        className="leading-[1.05] mt-3"
        style={{
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 64,
          letterSpacing: "-0.025em",
          color: VBT.ink,
        }}
      >
        {slide.title}
      </h1>
      <div
        className="mt-6 text-base"
        style={{ color: VBT.inkSoft, fontWeight: 500 }}
      >
        {partOf}
      </div>
      <ul className="mt-8 space-y-2.5">
        {slide.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3 text-[15px]" style={{ color: VBT.ink }}>
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5 text-[10px]"
              style={{ background: VBT.terracotta500, color: VBT.paper, fontWeight: 800 }}
            >
              {i + 1}
            </span>
            <span style={{ fontWeight: 500 }}>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecoSlideBody({ slide }: { slide: Extract<AdvSlide, { kind: "reco" }> }) {
  const cols = slide.groups.length <= 2 ? 1 : 2;
  return (
    <div className={`flex-1 grid gap-x-6 gap-y-4 ${cols === 1 ? "grid-cols-1" : "grid-cols-2"} min-h-0 overflow-hidden`}>
      {slide.groups.map((g, i) => (
        <div key={i} className="min-w-0">
          <div
            className="text-[12px] uppercase tracking-[0.16em] mb-2"
            style={{ color: VBT.terracotta600, fontWeight: 700 }}
          >
            {g.sub_label}
          </div>
          <ul className="space-y-1.5">
            {g.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2 text-[12.5px]" style={{ color: VBT.ink, lineHeight: 1.5 }}>
                <span className="shrink-0 mt-1" style={{ color: VBT.terracotta500 }}>▸</span>
                <span style={{ fontWeight: 400 }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
                {["Page de destination", "Inlinks", "Ancres uniques", "Diversité", "Ancre dominante"].map((h) => (
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

export function PrioritySlideBody({
  slide,
  onRequestAi,
  busy,
}: {
  slide: Extract<AdvSlide, { kind: "priority" }>;
  onRequestAi: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
      <div className="col-span-7 flex flex-col gap-2 min-w-0">
        <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: VBT.terracotta600, fontWeight: 700 }}>
          Top 12 chantiers — classés par sévérité × volume × poids SEO
        </div>
        <div className="space-y-1.5 overflow-y-auto pr-1">
          {slide.items.slice(0, 12).map((p) => (
            <PriorityRow key={p.rank} item={p} />
          ))}
        </div>
      </div>
      <div className="col-span-5 flex flex-col gap-3 min-w-0">
        <div
          className="text-[11px] uppercase tracking-[0.16em]"
          style={{ color: VBT.terracotta600, fontWeight: 700 }}
        >
          Synthèse consultant
        </div>
        <div
          className="flex-1 rounded-xl p-4 text-[12.5px] leading-relaxed min-h-0 overflow-y-auto"
          style={{
            background: VBT.paper,
            border: `1px solid ${VBT.paperEdge}`,
            color: VBT.inkSoft,
          }}
        >
          {slide.ai_summary ? (
            <p style={{ whiteSpace: "pre-wrap" }}>{slide.ai_summary}</p>
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
                className="px-3 py-1.5 rounded-lg text-[12px]"
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
  );
}

function PriorityRow({ item }: { item: PriorityItem }) {
  const urgencyPalette =
    item.urgency === "critical" ? { bg: VBT.brick50, fg: VBT.brick500, border: "#E5BDB5" } :
    item.urgency === "high" ?     { bg: "#FBE9D6", fg: VBT.terracotta700, border: "#F5D5BA" } :
    item.urgency === "medium" ?   { bg: VBT.amber50, fg: VBT.amber600, border: "#E5CD83" } :
    { bg: VBT.paperEdge, fg: VBT.inkSoft, border: VBT.paperEdge };

  const effortLabel =
    item.effort === "quick-win" ? "Quick win" :
    item.effort === "medium" ? "Modéré" : "Chantier";
  const impactLabel = item.impact === "high" ? "Fort impact" : item.impact === "medium" ? "Impact moy." : "Faible impact";

  return (
    <div
      className="rounded-lg px-3 py-2 flex items-center gap-3 min-w-0"
      style={{ background: VBT.paper, border: `1px solid ${VBT.paperEdge}` }}
    >
      <div
        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[11px] tabular-nums"
        style={{
          background: VBT.terracotta500,
          color: VBT.paper,
          fontWeight: 800,
          fontFamily: "var(--font-vbt-title), 'Montserrat', system-ui, sans-serif",
        }}
      >
        {item.rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12.5px] truncate" style={{ color: VBT.ink, fontWeight: 600 }} title={item.title}>
            {item.title}
          </span>
          <span
            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
            style={{ background: urgencyPalette.bg, color: urgencyPalette.fg, fontWeight: 700, border: `1px solid ${urgencyPalette.border}` }}
          >
            {item.urgency}
          </span>
        </div>
        <div className="text-[10.5px] mt-0.5 truncate" style={{ color: VBT.zinc }}>
          {item.affected} URLs · {effortLabel} · {impactLabel}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Utility
// ===========================================================================

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
