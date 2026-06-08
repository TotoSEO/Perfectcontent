// Parse Screaming Frog FR "Données structurées > Tous"
// (donnees_structurees_tous.csv), produced when "Structured Data" extraction
// + schema.org validation is enabled in the crawl. This is the authoritative,
// site-wide view of which schema.org types each page exposes, plus the
// validation errors/warnings — far richer than the homepage-only JSON-LD
// fetch we used before. The AI then REASONS over these facts (what to enrich,
// what's missing and where, what to fix).
//
// Columns (FR) : Adresse, Erreurs, Avertissements, Erreurs Rich Result,
// Avertissements Rich Result, Fonctionnalités Rich Result, Fonctionnalité-1,
// Total des types, Types uniques, Type-1 … Type-N, Indexabilité,
// Statut d'indexabilité.

import Papa from "papaparse";

const URL_KEYS = ["adresse", "address", "url"];
const ERRORS_KEYS = ["erreurs", "errors"];
const WARNINGS_KEYS = ["avertissements", "warnings"];
const INDEXABILITY_KEYS = ["indexabilite", "indexability"];

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‚‛ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(rec: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const v = rec[normalizeKey(a)];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function num(s: string): number {
  const v = parseInt((s || "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(v) ? v : 0;
}

export type StructuredPage = {
  url: string;
  types: string[];
  errors: number;
  warnings: number;
  indexable: boolean;
};

export type StructuredSfStats = {
  filename: string | null;
  page_count: number;          // pages present in the export
  pages_with_data: number;     // pages exposing at least one schema type
  pages_without_data: number;
  total_errors: number;
  total_warnings: number;
  pages_with_errors: number;
  distinct_types: number;
  // Site-wide type inventory : how many pages expose each schema type.
  type_inventory: { type: string; pages: number }[];
  // A handful of strategic pages (homepage + one representative per URL
  // group) with their type list : the basis for the AI's reasoning.
  strategic: { url: string; types: string[]; errors: number; warnings: number }[];
  // Full per-page detail for the XLSX sheet.
  pages: StructuredPage[];
};

function firstSegment(url: string): string {
  try {
    const p = new URL(url);
    const parts = p.pathname.split("/").filter(Boolean);
    return parts.length ? `/${parts[0]}/` : "/";
  } catch {
    return "/";
  }
}

function isHomepage(url: string): boolean {
  try {
    const p = new URL(url);
    return p.pathname === "/" || p.pathname === "";
  } catch {
    return false;
  }
}

// Pick the homepage + one representative (richest) page per URL group, capped.
function selectStrategic(pages: StructuredPage[], cap = 8): StructuredPage[] {
  const withData = pages.filter((p) => p.indexable && p.types.length > 0);
  const out: StructuredPage[] = [];
  const seen = new Set<string>();

  const home = withData.find((p) => isHomepage(p.url));
  if (home) { out.push(home); seen.add(home.url); }

  const groups = new Map<string, StructuredPage[]>();
  for (const p of withData) {
    const g = firstSegment(p.url);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }
  // Largest groups first ; representative = the page with the most types
  // (best showcase of what that template exposes).
  const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [, list] of sortedGroups) {
    if (out.length >= cap) break;
    const rep = list.slice().sort((a, b) => b.types.length - a.types.length)[0];
    if (rep && !seen.has(rep.url)) { out.push(rep); seen.add(rep.url); }
  }
  return out.slice(0, cap);
}

export type StructuredSfParseResult = { stats: StructuredSfStats };

export async function parseStructuredCsv(file: File): Promise<StructuredSfParseResult> {
  const text = await file.text();
  return parseStructuredCsvText(text, file.name);
}

export function parseStructuredCsvText(textRaw: string, filename: string | null): StructuredSfParseResult {
  let text = textRaw.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const probe = normalizeKey(lines[i]);
    if (/(?:^|[,;\t])\s*(adresse|address|url)(?:[,;\t]|$)/.test(probe)) {
      if (i > 0) text = lines.slice(i).join("\n");
      break;
    }
  }
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: normalizeKey,
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const pages: StructuredPage[] = [];
  const typeCount = new Map<string, number>();
  let totalErrors = 0;
  let totalWarnings = 0;
  let pagesWithErrors = 0;

  for (const rec of result.data as Record<string, string>[]) {
    const url = pick(rec, URL_KEYS);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    // Gather every "Type-N" column value.
    const types: string[] = [];
    for (const [k, v] of Object.entries(rec)) {
      if (/^type-\d+$/.test(k) && v && v.trim()) types.push(v.trim());
    }
    const uniqueTypes = [...new Set(types)];
    const errors = num(pick(rec, ERRORS_KEYS));
    const warnings = num(pick(rec, WARNINGS_KEYS));
    const indexable = normalizeKey(pick(rec, INDEXABILITY_KEYS)).startsWith("indexable");
    totalErrors += errors;
    totalWarnings += warnings;
    if (errors > 0) pagesWithErrors++;
    for (const t of uniqueTypes) typeCount.set(t, (typeCount.get(t) || 0) + 1);
    pages.push({ url, types: uniqueTypes, errors, warnings, indexable });
  }

  const pagesWithData = pages.filter((p) => p.types.length > 0).length;
  const inventory = [...typeCount.entries()]
    .map(([type, p]) => ({ type, pages: p }))
    .sort((a, b) => b.pages - a.pages);

  const strategic = selectStrategic(pages).map((p) => ({
    url: p.url, types: p.types, errors: p.errors, warnings: p.warnings,
  }));

  return {
    stats: {
      filename,
      page_count: pages.length,
      pages_with_data: pagesWithData,
      pages_without_data: pages.length - pagesWithData,
      total_errors: totalErrors,
      total_warnings: totalWarnings,
      pages_with_errors: pagesWithErrors,
      distinct_types: typeCount.size,
      type_inventory: inventory,
      strategic,
      pages,
    },
  };
}
