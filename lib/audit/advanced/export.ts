// Excel export for the advanced audit. One sheet per subcategory + a
// Synthèse cover sheet + the priority list. Sheet names match the
// `xlsx_sheet` references shown on every slide so the consultant can hand
// the deck and the XLSX to a client without explanation.

import { SEVERITY as SEV } from "../brand";
import type { AdvReport, AdvSubcategory, PriorityItem } from "./types";

const SEVERITY_BG: Record<string, string> = {
  critical: SEV.critical.argbBg,
  high:     SEV.high.argbBg,
  medium:   SEV.medium.argbBg,
  low:      SEV.low.argbBg,
  info:     SEV.info.argbBg,
};
const SEVERITY_FG: Record<string, string> = {
  critical: SEV.critical.argbFg,
  high:     SEV.high.argbFg,
  medium:   SEV.medium.argbFg,
  low:      SEV.low.argbFg,
  info:     SEV.info.argbFg,
};
const HEADER_BG = "FF7E411A";  // terracotta 700
const SCORE_GOOD_BG = "FFEAF2E0";
const SCORE_GOOD_FG = "FF3F6336";
const SCORE_WARN_BG = "FFFBF4DE";
const SCORE_WARN_FG = "FF7C621A";
const SCORE_BAD_BG  = "FFF8E4E0";
const SCORE_BAD_FG  = "FF642720";
const HYPERLINK_FG  = "FFC46B30";
const URGENCY_BG: Record<string, string> = {
  critical: "FFF8E4E0",
  high:     "FFFBE9D6",
  medium:   "FFFBF4DE",
  low:      "FFF4F1E6",
};
const URGENCY_FG: Record<string, string> = {
  critical: "FF642720",
  high:     "FF7E411A",
  medium:   "FF7C621A",
  low:      "FF534111",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

function safeSheetName(s: string): string {
  // Excel forbids :\\/?*[] and caps at 31 chars
  return s.replace(/[\\/:*?\[\]]/g, "_").slice(0, 31);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function styleHeader(row: { height?: number; eachCell: (cb: (cell: { fill: unknown; font: unknown; alignment: unknown }) => void) => void }) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.font = { color: { argb: "FFFFFCF7" }, bold: true, size: 11, name: "Montserrat" };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
}

export async function exportAdvancedToXlsx(report: AdvReport, auditName: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "PerfectContent : Audit avancé";
  wb.created = new Date();

  // ===== Synthèse sheet =====
  const synth = wb.addWorksheet("Synthèse", { views: [{ state: "frozen", ySplit: 1 }] });
  synth.columns = [
    { header: "Catégorie",         key: "label",     width: 30 },
    { header: "Score /100",        key: "score",     width: 12 },
    { header: "Poids",             key: "weight",    width: 10 },
    { header: "# Sous-cat.",       key: "subs",      width: 12 },
    { header: "# Problèmes",       key: "issues",    width: 14 },
    { header: "Résumé",            key: "summary",   width: 80 },
  ];
  styleHeader(synth.getRow(1));
  for (const sec of report.sections) {
    const totalIssues = sec.subcategories.reduce((s, sub) => s + sub.issues_full.length, 0);
    const row = synth.addRow({
      label: sec.label,
      score: sec.score,
      weight: sec.weight,
      subs: sec.subcategories.length,
      issues: totalIssues,
      summary: sec.summary,
    });
    const scoreCell = row.getCell("score");
    if (sec.score >= 80) {
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SCORE_GOOD_BG } };
      scoreCell.font = { color: { argb: SCORE_GOOD_FG }, bold: true };
    } else if (sec.score >= 50) {
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SCORE_WARN_BG } };
      scoreCell.font = { color: { argb: SCORE_WARN_FG }, bold: true };
    } else {
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SCORE_BAD_BG } };
      scoreCell.font = { color: { argb: SCORE_BAD_FG }, bold: true };
    }
  }
  // Add a totals row at the bottom
  const grandTotal = report.sections.reduce(
    (s, sec) => s + sec.subcategories.reduce((acc, sub) => acc + sub.issues_full.length, 0),
    0,
  );
  const totalRow = synth.addRow({
    label: "TOTAL", score: report.global_score, weight: 100, subs: report.sections.reduce((s, sec) => s + sec.subcategories.length, 0), issues: grandTotal, summary: "",
  });
  totalRow.font = { bold: true };
  synth.autoFilter = { from: "A1", to: `F${synth.rowCount}` };

  // ===== Exclusions sheet =====
  // Transparency : exactly what was filtered out at parse time and why.
  // Lets the consultant defend numbers to the client and surfaces any
  // detection that might have been overly aggressive.
  {
    const exc = wb.addWorksheet("Exclusions", { views: [{ state: "frozen", ySplit: 1 }] });
    exc.columns = [
      { header: "Élément filtré",      key: "label",  width: 56 },
      { header: "Volume",              key: "count",  width: 14 },
      { header: "Pourquoi ce filtre",  key: "why",    width: 80 },
    ];
    styleHeader(exc.getRow(1));
    const d = report.diagnostics;
    const lines: Array<{ label: string; count: number; why: string }> = [
      {
        label: "URLs de pagination exclues d'interne_html.csv",
        count: d.pagination_excluded_count,
        why: "Pages identifiées via les motifs /page/N(/) ou /p/N(/) ou ?page=N etc. Exclues de tous les compteurs (URLs analysées, codes HTTP, profondeur, balises, maillage).",
      },
      {
        label: "Pages HTML analysées (post-pagination)",
        count: d.html_pages_count,
        why: "Total des pages text/html crawlées, après exclusion des URLs de pagination.",
      },
      {
        label: "dont indexables",
        count: d.indexable_html_count,
        why: "Sous-ensemble Indexable parmi les pages HTML. Utilisé pour les analyses de doublons (title, meta, H1).",
      },
      {
        label: "Liens contextuels (Position du lien = Contenu)",
        count: d.contextual_links_count,
        why: "Lignes d'liens_entrants_tous.csv où Type = Hyperlien, Position du lien = Contenu, destination interne, statut 200.",
      },
      {
        label: "dont éditoriaux (filtre fin)",
        count: d.editorial_links_count,
        why: "Liens contextuels après exclusion des CTAs templatés, blocs articles (Chemin = card/article/post), liens-images (Texte Alt rempli, Ancrage vide), liens-boutons (Chemin = btn/cta).",
      },
      {
        label: "Ancres vides éditoriales",
        count: d.empty_editorial_anchor_count,
        why: "Liens éditoriaux dont Ancrage ET Texte Alt sont tous deux vides. Vrai problème d'accessibilité et de SEO.",
      },
    ];
    if (d.anchor_filter_breakdown) {
      const b = d.anchor_filter_breakdown;
      lines.push(
        { label: "  · CTAs templatés exclus du calcul de diversité", count: b.template_cta, why: 'Ancres dans la liste noire ("Nous contacter", "Demander une démo", "S\'inscrire", etc.) — ce sont des boutons de template, pas des ancres éditoriales.' },
        { label: "  · Liens-images exclus", count: b.image_wrapping, why: "Liens dont Ancrage est vide mais Texte Alt est renseigné — ce sont des images cliquables, pas des ancres rédactionnelles." },
        { label: "  · Blocs articles / cards exclus", count: b.card_path, why: "Chemin du lien contenant article, card, post, blog-item, etc. : des cartes de listing cliquables, pas des ancres dans le corps de texte." },
        { label: "  · Boutons / CTAs templatés (par chemin) exclus", count: b.button_path, why: "Chemin du lien contenant button, btn, cta, call-to-action : éléments de design, pas des ancres rédactionnelles." },
        { label: "  · Destinations vers une page de pagination exclues", count: b.pagination_dest, why: "Liens internes pointant vers /page/N, ?page=N etc. — doublons de canonique, ne polluent plus le calcul de diversité." },
      );
    }
    for (const row of lines) {
      const wsRow = exc.addRow(row);
      wsRow.getCell("count").alignment = { horizontal: "right" };
      wsRow.getCell("why").alignment = { wrapText: true, vertical: "top" };
      wsRow.height = 36;
    }
    exc.autoFilter = { from: "A1", to: `C${exc.rowCount}` };
  }

  // ===== Priorities sheet =====
  if (report.priorities.length > 0) {
    const prio = wb.addWorksheet("Priorisation", { views: [{ state: "frozen", ySplit: 1 }] });
    prio.columns = [
      { header: "Rang",       key: "rank",       width: 8 },
      { header: "Urgence",    key: "urgency",    width: 12 },
      { header: "Catégorie",  key: "section",    width: 26 },
      { header: "Sujet",      key: "title",      width: 30 },
      { header: "# URLs",     key: "affected",   width: 12 },
      { header: "Effort",     key: "effort",     width: 14 },
      { header: "Impact",     key: "impact",     width: 12 },
      { header: "Justification", key: "rationale", width: 80 },
    ];
    styleHeader(prio.getRow(1));
    for (const p of report.priorities) {
      const sec = report.sections.find((s) => s.id === p.section_id);
      const wsRow = prio.addRow({
        rank: p.rank,
        urgency: p.urgency,
        section: sec?.label || p.section_id,
        title: p.title,
        affected: p.affected,
        effort: p.effort === "quick-win" ? "Action rapide" : p.effort === "medium" ? "Effort modéré" : "Chantier de fond",
        impact: p.impact === "high" ? "Fort" : p.impact === "medium" ? "Modéré" : "Faible",
        rationale: p.rationale,
      });
      const cell = wsRow.getCell("urgency");
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: URGENCY_BG[p.urgency] || URGENCY_BG.low } };
      cell.font = { color: { argb: URGENCY_FG[p.urgency] || URGENCY_FG.low }, bold: true };
      cell.alignment = { horizontal: "center" };
      wsRow.height = 32;
      wsRow.getCell("rationale").alignment = { wrapText: true, vertical: "top" };
    }
    prio.autoFilter = { from: "A1", to: `H${prio.rowCount}` };
  }

  // ===== One sheet per subcategory with issues =====
  for (const sec of report.sections) {
    for (const sub of sec.subcategories) {
      if (sub.issues_full.length === 0 || sub.columns.length === 0) continue;
      const sheetName = safeSheetName(sub.xlsx_sheet);

      // Special case : the "Ancres vides" sheet uses a custom layout —
      // rows are grouped by the `_group` field (target URL), each group
      // gets its own header row + a coloured background that alternates
      // between two soft tints so the boundary between two adjacent
      // groups is always visible.
      if (sub.id === "anchors_empty") {
        renderEmptyAnchorsSheet(wb, sheetName, sub);
        continue;
      }

      // Sort issues by severity (critical first)
      const rows = [...sub.issues_full].sort(
        (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
      );
      const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
      const cols = [
        { header: "Sévérité", key: "severity", width: 12 },
        ...sub.columns.map((col) => ({
          header: col.label,
          key: col.key,
          width: col.width ?? (col.key === "url" || col.key.includes("anchor") || col.key === "source" ? 60 : 18),
        })),
      ];
      ws.columns = cols;
      styleHeader(ws.getRow(1));
      for (const r of rows) {
        const data: Record<string, unknown> = { severity: r.severity };
        for (const col of sub.columns) {
          const v = r[col.key];
          data[col.key] = v == null ? "" : v;
        }
        const wsRow = ws.addRow(data);
        const bg = SEVERITY_BG[r.severity];
        const fg = SEVERITY_FG[r.severity];
        if (bg) {
          wsRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          });
        }
        if (fg) {
          const sc = wsRow.getCell("severity");
          sc.font = { color: { argb: fg }, bold: true };
          sc.alignment = { horizontal: "center" };
        }
        // URL-like columns become hyperlinks. Only touch columns we declared
        // for this sheet : calling getCell() with a key that doesn't match
        // any column triggers exceljs's "Out of bounds. Excel supports
        // columns from 1 to 16384" because the column index resolves to NaN.
        const declaredKeys = new Set(sub.columns.map((c) => c.key));
        for (const key of ["url", "source", "destination"]) {
          if (!declaredKeys.has(key)) continue;
          const cell = wsRow.getCell(key);
          const v = data[key];
          if (typeof v === "string" && /^https?:\/\//.test(v)) {
            cell.value = { text: v, hyperlink: v };
            cell.font = { color: { argb: HYPERLINK_FG }, underline: true };
          }
        }
      }
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `audit-avance-${safeName || "seo"}-${date}.xlsx`);
}

// Build a flat list of (sub_id → xlsx sheet name) so we can render the
// "Voir l'onglet …" badge on each slide consistently with the actual sheet
// names the export produces.
export function buildSheetMap(subs: AdvSubcategory[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of subs) out[s.id] = safeSheetName(s.xlsx_sheet);
  return out;
}

// ===========================================================================
// "Ancres vides" sheet — custom rendering with group separators.
//
// Standard sheets are flat (one row per issue, coloured by severity). For
// the empty anchors sheet the consultant needs to see WHICH target URLs
// are affected and BY HOW MANY source URLs — flat severity rows would
// obscure that. So we render each destination group as a banded block :
//
//    ┌────────────────────────────────────────────────────────┐
//    │ ▶ https://target1.com/page-a   ·   12 liens vides     │  ← header row (terracotta band)
//    ├────────────────────────────────────────────────────────┤
//    │     https://source1.com/   →   https://target1.com/   │  ← detail rows
//    │     https://source2.com/   →   https://target1.com/   │     (alternating tints)
//    │     …                                                  │
//    └────────────────────────────────────────────────────────┘
//    ┌────────────────────────────────────────────────────────┐
//    │ ▶ https://target2.com/page-b   ·   3 liens vides      │  ← next group
//    └────────────────────────────────────────────────────────┘
//
// Each group alternates between two soft red/orange tints so adjacent
// groups stay visually separated even at high zoom.
// ===========================================================================

const EMPTY_GROUP_HEADER_A = "FFFEE2E2"; // soft red
const EMPTY_GROUP_HEADER_B = "FFFFEDD5"; // soft orange
const EMPTY_GROUP_HEADER_FG_A = "FFB91C1C"; // strong red text
const EMPTY_GROUP_HEADER_FG_B = "FF9A3412"; // strong orange text
const EMPTY_GROUP_BODY_A = "FFFEF7F7";    // very-soft red row
const EMPTY_GROUP_BODY_B = "FFFFF8F0";    // very-soft orange row
const EMPTY_GROUP_EDGE_A = "FFFCA5A5";    // red border
const EMPTY_GROUP_EDGE_B = "FFFDBA74";    // orange border

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderEmptyAnchorsSheet(wb: any, sheetName: string, sub: AdvSubcategory): void {
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });

  // Group rows by `_group` (= destination URL), preserving the input order.
  const groupsMap = new Map<string, { destination: string; sources: string[] }>();
  for (const r of sub.issues_full) {
    const destKey = String(r._group ?? r.destination ?? "");
    const source = String(r.url ?? "");
    const destination = String(r.destination ?? destKey);
    if (!groupsMap.has(destKey)) {
      groupsMap.set(destKey, { destination, sources: [] });
    }
    groupsMap.get(destKey)!.sources.push(source);
  }
  // Sort groups by source count desc so the worst offenders appear first.
  const groups = [...groupsMap.values()].sort((a, b) => b.sources.length - a.sources.length);

  ws.columns = [
    { header: "URL source du lien", key: "url", width: 70 },
    { header: "URL cible", key: "destination", width: 70 },
    { header: "Ancre", key: "anchor", width: 14 },
  ];
  styleHeader(ws.getRow(1));

  groups.forEach((g, gi) => {
    const tintIdx = gi % 2;
    const headerBg = tintIdx === 0 ? EMPTY_GROUP_HEADER_A : EMPTY_GROUP_HEADER_B;
    const headerFg = tintIdx === 0 ? EMPTY_GROUP_HEADER_FG_A : EMPTY_GROUP_HEADER_FG_B;
    const bodyBg = tintIdx === 0 ? EMPTY_GROUP_BODY_A : EMPTY_GROUP_BODY_B;
    const edge = tintIdx === 0 ? EMPTY_GROUP_EDGE_A : EMPTY_GROUP_EDGE_B;

    // ---- Group header row : merged across the 3 columns ----
    const headerLabel = `▶ ${g.destination}   ·   ${g.sources.length} lien${g.sources.length > 1 ? "s" : ""} avec ancre vide`;
    const headerRow = ws.addRow([headerLabel, "", ""]);
    headerRow.height = 22;
    const startRow = ws.rowCount;
    ws.mergeCells(`A${startRow}:C${startRow}`);
    const hc = headerRow.getCell(1);
    hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerBg } };
    hc.font = {
      color: { argb: headerFg },
      bold: true,
      size: 11,
      name: "Montserrat",
    };
    hc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    hc.border = {
      top: { style: "medium", color: { argb: edge } },
      bottom: { style: "thin", color: { argb: edge } },
    };

    // ---- Detail rows : one per source URL ----
    for (const src of g.sources) {
      const wsRow = ws.addRow({
        url: src,
        destination: g.destination,
        anchor: "(vide)",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wsRow.eachCell((cell: any) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bodyBg } };
      });
      for (const key of ["url", "destination"]) {
        const cell = wsRow.getCell(key);
        const v = cell.value as unknown;
        if (typeof v === "string" && /^https?:\/\//.test(v)) {
          cell.value = { text: v, hyperlink: v };
          cell.font = { color: { argb: HYPERLINK_FG }, underline: true };
        }
      }
      const anchorCell = wsRow.getCell("anchor");
      anchorCell.font = { color: { argb: headerFg }, italic: true, bold: true };
      anchorCell.alignment = { horizontal: "center" };
    }
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: 3 } };
}
