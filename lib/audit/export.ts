// Excel export with colored cells. Lazy-loaded so exceljs doesn't bloat the
// main bundle.

import type { CategoryReport, IssueRow } from "./types";

const SEVERITY_BG: Record<string, string> = {
  critical: "FFFEE2E2",  // red-100
  high:     "FFFFEDD5",  // orange-100
  medium:   "FFFEF3C7",  // amber-100
  low:      "FFFEFCE8",  // yellow-50
  info:     "FFF4F4F5",  // zinc-100
};
const SEVERITY_FG: Record<string, string> = {
  critical: "FFB91C1C",
  high:     "FFC2410C",
  medium:   "FFB45309",
  low:      "FF854D0E",
  info:     "FF52525B",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

function bySeverity(a: IssueRow, b: IssueRow): number {
  return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
}

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
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

export async function exportIssuesToXlsx(
  auditName: string,
  issuesByCategory: Record<string, IssueRow[]>,
  categoriesMeta: Omit<CategoryReport, "issues_full">[],
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "PerfectContent";
  wb.created = new Date();

  // Synthèse sheet first
  const synth = wb.addWorksheet("Synthèse", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  synth.columns = [
    { header: "Catégorie",         key: "label",     width: 26 },
    { header: "Score /100",        key: "score",     width: 12 },
    { header: "# Problèmes",       key: "issues",    width: 14 },
    { header: "# Critical",        key: "critical",  width: 12 },
    { header: "# High",            key: "high",      width: 10 },
    { header: "# Medium",          key: "medium",    width: 10 },
    { header: "# Low",             key: "low",       width: 10 },
    { header: "Résumé",            key: "summary",   width: 80 },
  ];
  styleHeader(synth.getRow(1));
  for (const c of categoriesMeta) {
    const rows = issuesByCategory[c.id] || [];
    const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
    for (const r of rows) counts[r.severity] = (counts[r.severity] || 0) + 1;
    const row = synth.addRow({
      label: c.label,
      score: c.score,
      issues: rows.length,
      critical: counts.critical || 0,
      high: counts.high || 0,
      medium: counts.medium || 0,
      low: counts.low || 0,
      summary: c.summary || "",
    });
    // Score color
    const scoreCell = row.getCell("score");
    if (c.score >= 80) {
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
      scoreCell.font = { color: { argb: "FF065F46" }, bold: true };
    } else if (c.score >= 50) {
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      scoreCell.font = { color: { argb: "FF92400E" }, bold: true };
    } else {
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      scoreCell.font = { color: { argb: "FF991B1B" }, bold: true };
    }
  }
  synth.autoFilter = { from: "A1", to: `H${synth.rowCount}` };

  // One sheet per category
  for (const c of categoriesMeta) {
    const rows = (issuesByCategory[c.id] || []).slice().sort(bySeverity);
    if (rows.length === 0) continue;
    const ws = wb.addWorksheet(safeSheetName(c.label), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const cols = [
      { header: "Sévérité", key: "severity", width: 12 },
      ...c.columns.map((col) => ({
        header: col.label,
        key: col.key,
        width: col.key === "url" ? 60 : col.key === "title" || col.key === "meta" ? 50 : 18,
      })),
    ];
    ws.columns = cols;
    styleHeader(ws.getRow(1));
    for (const r of rows) {
      const data: Record<string, unknown> = { severity: r.severity };
      for (const col of c.columns) {
        const v = r[col.key];
        data[col.key] = v == null ? "" : v;
      }
      const wsRow = ws.addRow(data);
      const sev = r.severity;
      const bg = SEVERITY_BG[sev];
      const fg = SEVERITY_FG[sev];
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
      // URL as hyperlink if present
      const urlCell = wsRow.getCell("url");
      const urlVal = data.url;
      if (typeof urlVal === "string" && /^https?:\/\//.test(urlVal)) {
        urlCell.value = { text: urlVal, hyperlink: urlVal };
        urlCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `audit-${safeName || "seo"}-${date}.xlsx`);
}

function styleHeader(row: any) {
  row.height = 22;
  row.eachCell((cell: any) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
}
