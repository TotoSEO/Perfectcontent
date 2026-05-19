// Parse Screaming Frog FR "Exporter en bloc > Liens > Liens entrants Tous"
// (liens_entrants_tous.csv).
//
// COLUMN VALUES OBSERVED IN REAL FR EXPORTS (don't trust the user-facing
// spec — the values are localised):
//
//   • Type             "Hyperlien" (FR) / "Hyperlink" (EN) / "Lien hypertexte"
//                      Also: "CSS", "Canonique HTML", "Hreflang HTML",
//                      "Hreflang HTTP", "Iframe", "Image", "JavaScript",
//                      "Redirection HTTP" — all to be excluded.
//   • Position du lien (←dedicated column, not "Chemin du lien")
//                      "Contenu" (the only one we keep),
//                      "Navigation", "En-tête", "Tête", "Pied de page".
//   • Code de statut   the HTTP status of the *destination* of the link.
//                      We use this to surface broken links straight out
//                      of this file — Screaming Frog's Bulk Issues export
//                      doesn't always carry "broken internal links" as a
//                      named file, but every <a href> with a non-2xx
//                      destination shows up here.
//   • Origine du lien  "HTML" / "HTTP" — this is the link delivery
//                      format, NOT internal/external. To tell internal
//                      apart from external, compare hostnames between
//                      Source and Destination.
//
// The file can easily reach 80+ MB (this user shipped 27 MB / 89 k rows
// at 1 000 pages crawled), so we stream with Papaparse `step`.

import Papa from "papaparse";
import type { AnchorDestinationSummary, AnchorRow } from "./types";

const SOURCE_KEYS = ["source", "url source", "page source", "from"];
const DESTINATION_KEYS = ["destination", "url de destination", "to"];
const ANCHOR_KEYS = ["ancrage", "anchor", "anchor text", "texte d'ancre", "texte de l'ancre", "texte de l ancre"];
const TYPE_KEYS = ["type", "type de lien", "link type"];
const POSITION_KEYS = ["position du lien", "link position", "emplacement du lien", "position"];
const PATH_KEYS = ["chemin du lien", "link path", "type de chemin"];
const STATUS_KEYS = ["code de statut", "status code", "code http", "code de statut http"];
const STATUS_TEXT_KEYS = ["statut", "status"];

// FR + EN values for "this row is an <a href>" Type column.
const HYPERLINK_TYPES = ["hyperlien", "hyperlink", "lien hypertexte", "ahref"];
// FR + EN values that count as "body content" Position (everything else —
// Navigation, En-tête, Tête, Pied de page, Sidebar, Aside — is dropped).
const BODY_POSITIONS = [
  "contenu", "content",
  "body", "main", "article", "section",
  "corps", "principal",
];
// Generic anchors that signal a low-quality link no matter the rest.
const GENERIC_ANCHORS = new Set([
  "ici", "cliquez", "cliquez ici", "cliquer ici", "en savoir plus",
  "lire la suite", "voir", "decouvrir", "decouvrir plus",
  "plus d informations", "plus d'informations", "voir plus", "plus", "lire",
  "lien", "site",
  "here", "click", "click here", "read more", "learn more", "more",
  "see more", "link", "this", "this link",
]);

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

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSameDomain(source: string, destination: string): boolean {
  const a = hostname(source);
  const b = hostname(destination);
  if (!a || !b) return false;
  return a === b;
}

// A broken or redirected link discovered in the same stream that powers
// the anchor analysis. We surface these so the "Liens rompus" and
// "Liens 301 internes" slides work even when the Issues ZIP is missing the
// codes_de_reponse_* files.
export type BrokenLink = {
  source: string;
  destination: string;
  anchor: string;
  status: number;
  origin: "internal" | "external";
};

// An internal redirect we want to surface: page A has an <a href> to
// page B which returns 3xx. The fix is to update A's link to point
// straight at the redirect target.
export type RedirectedLink = {
  source: string;
  destination: string;
  anchor: string;
  status: number; // 301 / 302 / 307 / 308
};

// An internal link still emitted in HTTP (mixed content risk on an
// HTTPS site).
export type HttpLink = {
  source: string;
  destination: string;
  anchor: string;
};

export type AnchorsParseResult = {
  rows: AnchorRow[];
  by_destination: Map<string, AnchorDestinationSummary>;
  // Diagnostics: raw lines vs. rows that passed every filter.
  total_links_raw: number;
  total_links_filtered: number;
  // Per-rejection counters so the import UI can explain WHY rows were
  // dropped. Helps catch future SF locale / format drift early.
  filtered_breakdown: {
    not_hyperlink: number;
    not_body_position: number;
    no_destination: number;
    non_200: number;
    external: number;
  };
  broken_links: BrokenLink[];
  redirected_links: RedirectedLink[];
  http_links: HttpLink[];
  filename: string | null;
};

const MAX_FILTERED_ROWS = 50_000;
const MAX_BROKEN_LINKS = 5_000;
const MAX_REDIRECT_LINKS = 5_000;
const MAX_HTTP_LINKS = 2_000;

type Accumulator = {
  count: number;
  anchors: Map<string, number>;
};

function streamAndFilter(
  text: string,
  onAnchorRow: (row: AnchorRow) => void,
  onBrokenLink: (link: BrokenLink) => void,
  onRedirect: (link: RedirectedLink) => void,
  onHttpLink: (link: HttpLink) => void,
  setStats: (stats: AnchorsParseResult["filtered_breakdown"] & { raw: number; filtered: number }) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let raw = 0;
    let filtered = 0;
    let broken = 0;
    let redirected = 0;
    let httpLinks = 0;
    const breakdown = {
      not_hyperlink: 0,
      not_body_position: 0,
      no_destination: 0,
      non_200: 0,
      external: 0,
    };
    let aborted = false;
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: normalizeKey,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      step: ({ data }: { data: Record<string, string> }, parser) => {
        raw++;
        const type = normalizeKey(pick(data, TYPE_KEYS) || "");
        // Skip non-hyperlink rows (CSS, JS, Image, Iframe, Redirection HTTP,
        // Hreflang HTML, Canonique HTML…). When the Type column is missing,
        // we don't filter — better to keep too much than drop everything.
        if (type && !HYPERLINK_TYPES.some((t) => type === t || type.includes(t))) {
          breakdown.not_hyperlink++;
          return;
        }
        const dest = pick(data, DESTINATION_KEYS);
        if (!dest || !/^https?:\/\//i.test(dest)) {
          breakdown.no_destination++;
          return;
        }
        const src = pick(data, SOURCE_KEYS) || "";
        const anchor = pick(data, ANCHOR_KEYS) || "";
        const statusStr = pick(data, STATUS_KEYS);
        const statusCode = statusStr ? parseInt(statusStr, 10) : 200;
        const internal = src ? isSameDomain(src, dest) : true;

        // Broken-link harvest (4xx / 5xx). Fires for both internal and
        // external destinations and is independent of the body-position
        // filter — a broken nav link is still a broken link.
        if (statusCode >= 400 && broken < MAX_BROKEN_LINKS) {
          broken++;
          onBrokenLink({
            source: src,
            destination: dest,
            anchor,
            status: statusCode,
            origin: internal ? "internal" : "external",
          });
        }

        // Redirect-link harvest (3xx). Internal only — these are the
        // links you want to update to skip the redirect chain.
        if (statusCode >= 300 && statusCode < 400 && internal && redirected < MAX_REDIRECT_LINKS) {
          redirected++;
          onRedirect({
            source: src,
            destination: dest,
            anchor,
            status: statusCode,
          });
        }

        // Mixed-content harvest: internal links still emitted as http://
        // even though the site is served over https://. Both source and
        // destination must be internal for this to be actionable.
        if (
          internal &&
          dest.startsWith("http://") &&
          (!src || src.startsWith("https://")) &&
          httpLinks < MAX_HTTP_LINKS
        ) {
          httpLinks++;
          onHttpLink({ source: src, destination: dest, anchor });
        }

        // Anchor analysis — only contextual, internal, 200-OK links count.
        const position = normalizeKey(pick(data, POSITION_KEYS) || "");
        if (position && !BODY_POSITIONS.some((p) => position === p || position.includes(p))) {
          breakdown.not_body_position++;
          return;
        }
        if (!internal) {
          breakdown.external++;
          return;
        }
        if (statusCode >= 300) {
          breakdown.non_200++;
          return;
        }

        filtered++;
        onAnchorRow({
          source: src,
          destination: dest,
          anchor,
          position: position || "",
          is_generic: isGeneric(anchor),
          is_empty: !anchor.trim(),
        });

        if (filtered >= MAX_FILTERED_ROWS && !aborted) {
          aborted = true;
          parser.abort();
        }
      },
      complete: () => {
        setStats({ raw, filtered, ...breakdown });
        resolve();
      },
      error: (err: Error) => reject(err),
    });
  });
}

export async function parseAnchorsCsv(file: File): Promise<AnchorsParseResult> {
  const text = await file.text();
  return parseAnchorsCsvText(text, file.name);
}

export async function parseAnchorsCsvText(textRaw: string, filename: string | null): Promise<AnchorsParseResult> {
  const text = textRaw.replace(/^﻿/, "");

  const keptRows: AnchorRow[] = [];
  const brokenLinks: BrokenLink[] = [];
  const redirectedLinks: RedirectedLink[] = [];
  const httpLinks: HttpLink[] = [];
  const aggregator = new Map<string, Accumulator>();
  let stats: AnchorsParseResult["filtered_breakdown"] & { raw: number; filtered: number } = {
    raw: 0, filtered: 0,
    not_hyperlink: 0, not_body_position: 0, no_destination: 0, non_200: 0, external: 0,
  };

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
    (link) => { brokenLinks.push(link); },
    (link) => { redirectedLinks.push(link); },
    (link) => { httpLinks.push(link); },
    (s) => { stats = s; },
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
    total_links_raw: stats.raw,
    total_links_filtered: stats.filtered,
    filtered_breakdown: {
      not_hyperlink: stats.not_hyperlink,
      not_body_position: stats.not_body_position,
      no_destination: stats.no_destination,
      non_200: stats.non_200,
      external: stats.external,
    },
    broken_links: brokenLinks,
    redirected_links: redirectedLinks,
    http_links: httpLinks,
    filename,
  };
}

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

export function pickTopConcentratedDestinations(
  summary: Map<string, AnchorDestinationSummary>,
  minInlinks = 5,
  limit = 6,
): AnchorDestinationSummary[] {
  const out = [...summary.values()].filter((s) => s.inlinks_count >= minInlinks);
  out.sort((a, b) => b.dominant_anchor_pct - a.dominant_anchor_pct);
  return out.slice(0, limit);
}
