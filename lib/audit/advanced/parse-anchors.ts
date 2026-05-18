// Parse Screaming Frog FR "Exporter en bloc > Liens > Liens entrants Tous"
// (liens_entrants_tous.csv). This file is potentially huge (80+ MB on
// medium sites), so we use Papaparse in `step` mode: rows are streamed,
// filtered in-flight against the user's rules, and only kept in memory if
// they pass all three filters:
//
//   1. Type = "Hyperlink"          (excludes images / JS / CSS / canonicals)
//   2. Origine du lien = "interne" (only internal maillage)
//   3. Chemin du lien does NOT contain "nav", "header", "footer", "menu"
//      (excludes boilerplate links — we only want contextual anchors)
//
// After streaming, we aggregate by destination URL to compute the diversity
// ratio + dominant anchor needed by the "Texte des ancres" slides.

import Papa from "papaparse";
import type { AnchorDestinationSummary, AnchorRow } from "./types";

const SOURCE_KEYS = ["source", "url source", "page source"];
const DESTINATION_KEYS = ["destination", "url de destination"];
const ANCHOR_KEYS = ["ancrage", "anchor", "anchor text", "texte d'ancre", "texte de l'ancre"];
const TYPE_KEYS = ["type", "type de lien", "link type"];
const PATH_KEYS = ["chemin du lien", "link path"];
const ORIGIN_KEYS = ["origine du lien", "origine", "link origin"];

const GENERIC_ANCHORS = new Set([
  // FR
  "ici", "cliquez", "cliquez ici", "cliquer ici", "en savoir plus",
  "lire la suite", "voir", "decouvrir", "decouvrir plus",
  "plus d informations", "plus d'informations", "voir plus", "plus", "lire",
  "lien", "site",
  // EN
  "here", "click", "click here", "read more", "learn more", "more",
  "see more", "link", "this", "this link",
]);

// Match these only when they appear as a standalone HTML element in the
// "Chemin du lien" selector, e.g. "html > body > nav > a", "body > header.x > a".
// A naive substring match (path.includes("nav")) would also strip out
// content links whose class names happen to contain "nav-" or "menu-",
// which is what was previously emptying out the entire dataset.
const NAV_TAG_REGEX = /(?:^|>)\s*(nav|header|footer|menu|aside)\b/i;

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

function pick(rec: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const v = rec[normalizeKey(a)];
    if (v !== undefined && v !== "") return v;
  }
  return null;
}

function isGeneric(anchor: string): boolean {
  const norm = normalizeKey(anchor || "");
  if (!norm) return false;
  return GENERIC_ANCHORS.has(norm);
}

function isNavPath(path: string): boolean {
  if (!path) return false;
  return NAV_TAG_REGEX.test(path);
}

export type AnchorsParseResult = {
  rows: AnchorRow[];
  by_destination: Map<string, AnchorDestinationSummary>;
  total_links_raw: number;     // every line in the CSV
  total_links_filtered: number; // after Type/Origine/Chemin filter
  filename: string | null;
};

// Per-row aggregator built during streaming so we never hold the full
// dataset uncompressed in memory.
type Accumulator = {
  count: number;
  anchors: Map<string, number>; // anchor text → occurrences for this dest
};

// Cap the per-link sample we keep in memory for the XLSX export. 50k rows
// covers all but very large sites; beyond that the Vercel POST body would
// blow up anyway and we cap each subcategory at MAX_ISSUES_PER_CAT (800).
const MAX_FILTERED_ROWS = 50_000;

function streamAndFilter(
  text: string,
  onRow: (row: AnchorRow) => void,
  onStats: (raw: number, filtered: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let raw = 0;
    let filtered = 0;
    let aborted = false;
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: normalizeKey,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      step: ({ data }: { data: Record<string, string> }, parser) => {
        raw++;
        // Screaming Frog FR keeps the "Type" cell value in English: it'll be
        // "Hyperlink", "Image", "JavaScript", "CSS"…  Some bilingual exports
        // also use "Lien hypertexte". Accept both, but reject everything else
        // (images, JS, CSS, canonicals).
        const type = (pick(data, TYPE_KEYS) || "").toLowerCase();
        if (type && !type.includes("hyperlink") && !type.includes("ahref") && !type.includes("lien hypertexte")) return;
        // Origine du lien: "interne" / "externe" in FR, "Internal" / "External"
        // in EN. We only keep internal. If the column is missing entirely
        // (older SF), don't filter on it.
        const origin = (pick(data, ORIGIN_KEYS) || "").toLowerCase();
        if (origin && !origin.includes("interne") && !origin.includes("internal")) return;
        const path = pick(data, PATH_KEYS) || "";
        if (isNavPath(path)) return;
        const dest = pick(data, DESTINATION_KEYS);
        if (!dest || !/^https?:\/\//i.test(dest)) return;
        const src = pick(data, SOURCE_KEYS) || "";
        const anchor = pick(data, ANCHOR_KEYS) || "";
        filtered++;
        onRow({
          source: src,
          destination: dest,
          anchor,
          position: path,
          is_generic: isGeneric(anchor),
          is_empty: !anchor.trim(),
        });
        if (filtered >= MAX_FILTERED_ROWS && !aborted) {
          aborted = true;
          parser.abort();
        }
      },
      complete: () => {
        onStats(raw, filtered);
        resolve();
      },
      error: (err: Error) => reject(err),
    });
  });
}

export async function parseAnchorsCsv(file: File): Promise<AnchorsParseResult> {
  // We read as text first (Papaparse's File input is also fine, but giving
  // it text makes the streaming order deterministic across browsers).
  const text = await file.text();
  return parseAnchorsCsvText(text, file.name);
}

export async function parseAnchorsCsvText(textRaw: string, filename: string | null): Promise<AnchorsParseResult> {
  const text = textRaw.replace(/^﻿/, "");

  const keptRows: AnchorRow[] = [];
  const aggregator = new Map<string, Accumulator>();
  let rawCount = 0;
  let filteredCount = 0;

  await streamAndFilter(
    text,
    (row) => {
      keptRows.push(row);
      let entry = aggregator.get(row.destination);
      if (!entry) {
        entry = { count: 0, anchors: new Map() };
        aggregator.set(row.destination, entry);
      }
      entry.count++;
      const key = (row.anchor || "(vide)").trim();
      entry.anchors.set(key, (entry.anchors.get(key) || 0) + 1);
    },
    (raw, filtered) => {
      rawCount = raw;
      filteredCount = filtered;
    },
  );

  const summary: Map<string, AnchorDestinationSummary> = new Map();
  for (const [dest, e] of aggregator.entries()) {
    const unique = e.anchors.size;
    const diversity = e.count > 0 ? unique / e.count : 0;
    let dominant = "";
    let dominantCount = 0;
    for (const [a, c] of e.anchors.entries()) {
      if (c > dominantCount) { dominant = a; dominantCount = c; }
    }
    summary.set(dest, {
      destination: dest,
      inlinks_count: e.count,
      unique_anchors: unique,
      diversity_ratio: Math.round(diversity * 1000) / 1000,
      dominant_anchor: dominant,
      dominant_anchor_count: dominantCount,
      dominant_anchor_pct: e.count > 0 ? Math.round((dominantCount / e.count) * 1000) / 10 : 0,
    });
  }

  return {
    rows: keptRows,
    by_destination: summary,
    total_links_raw: rawCount,
    total_links_filtered: filteredCount,
    filename,
  };
}

// Pick the most "problematic" destinations: low diversity + high inlinks
// volume. Returns them sorted with the worst at the top.
export function pickWorstDestinations(
  summary: Map<string, AnchorDestinationSummary>,
  minInlinks = 10,
  limit = 15,
): AnchorDestinationSummary[] {
  const out = [...summary.values()].filter((s) => s.inlinks_count >= minInlinks);
  out.sort((a, b) => {
    const dDiv = a.diversity_ratio - b.diversity_ratio;
    if (dDiv !== 0) return dDiv;
    return b.inlinks_count - a.inlinks_count;
  });
  return out.slice(0, limit);
}

// Pick the top N destinations to display in the bar chart (most concentrated
// dominant anchor = clearest over-optimization signal).
export function pickTopConcentratedDestinations(
  summary: Map<string, AnchorDestinationSummary>,
  minInlinks = 5,
  limit = 6,
): AnchorDestinationSummary[] {
  const out = [...summary.values()].filter((s) => s.inlinks_count >= minInlinks);
  out.sort((a, b) => b.dominant_anchor_pct - a.dominant_anchor_pct);
  return out.slice(0, limit);
}
