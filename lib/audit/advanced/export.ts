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
