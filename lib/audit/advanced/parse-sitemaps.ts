// Parse Screaming Frog FR "Sitemaps" export (sitemaps_tous.csv), produced
// after "Analyse du crawl > Commencer" with the XML sitemap configured in
// the crawl. This is the AUTHORITATIVE view of what the site's XML sitemap
// actually contains, enriched with each URL's crawl status (HTTP code +
// indexability). We use it instead of fetching/guessing the sitemap so the
// numbers are exact and the AI only interprets them (no hallucination).
//
// Columns (FR) : Adresse, Type de contenu, Code HTTP, Statut, Indexabilité,
// Statut d'indexabilité.

import Papa from "papaparse";

const URL_KEYS = ["adresse", "address", "url"];
const CT_KEYS = ["type de contenu", "content type", "content-type"];
const HTTP_KEYS = ["code http", "code de reponse", "code de réponse", "status code", "code"];
const INDEXABILITY_KEYS = ["indexabilite", "indexability"];
const INDEX_STATUS_KEYS = ["statut d'indexabilite", "statut d indexabilite", "indexability status"];

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

// One problem row per non-conforming URL found in the sitemap.
export type SitemapSfProblem = {
  url: string;
  problem: string;       // FR label, e.g. "Redirection (301)"
  http: string;          // HTTP code
  severity: "high" | "medium" | "low";
};

export type SitemapSfStats = {
  filename: string | null;
  total_rows: number;
  sitemap_file_count: number;   // child .xml / .kml sitemaps (index structure)
  content_url_count: number;    // real page URLs listed in the sitemap
  indexable_count: number;      // 200 + indexable (conforming)
  non_indexable_count: number;
  non_200_count: number;
  // Problem categories with counts, worst-first (for the slide breakdown).
  breakdown: { key: string; label: string; count: number }[];
  // Full list of non-conforming URLs (for the dedicated XLSX sheet).
  problems: SitemapSfProblem[];
};

// Map a (reason, http) pair to a problem category. Returns null when the URL
// is conforming (indexable 200).
function classify(indexable: boolean, reason: string, http: string): { key: string; label: string; severity: "high" | "medium" | "low" } | null {
  const r = normalizeKey(reason);
  const code = (http || "").trim();
  const is3xx = /^3\d\d$/.test(code);
  const is4xx = /^4\d\d$/.test(code);
  const is5xx = /^5\d\d$/.test(code);

  if (r.includes("bloque par robots") || r.includes("bloquee par robots") || r.includes("robots"))
    return { key: "robots", label: "Bloquée par robots.txt", severity: "high" };
  if (is5xx || r.includes("erreur serveur"))
    return { key: "server_error", label: "Erreur serveur (5xx)", severity: "high" };
  if (is4xx || r.includes("erreur client"))
    return { key: "client_error", label: "Page introuvable (4xx)", severity: "high" };
  if (is3xx || r.includes("redirig"))
    return { key: "redirect", label: "Redirection (3xx)", severity: "medium" };
  if (r.includes("canonis"))
    return { key: "canonical", label: "Canonisée vers une autre URL", severity: "medium" };
  if (r.includes("noindex"))
    return { key: "noindex", label: "Balise noindex", severity: "medium" };
  if (!indexable)
    return { key: "other", label: "Non indexable (autre)", severity: "low" };
  return null;
}

const BREAKDOWN_ORDER = ["client_error", "server_error", "robots", "redirect", "canonical", "noindex", "other"];

export type SitemapSfParseResult = {
  stats: SitemapSfStats;
};

export async function parseSitemapsCsv(file: File): Promise<SitemapSfParseResult> {
  const text = await file.text();
  return parseSitemapsCsvText(text, file.name);
}

export function parseSitemapsCsvText(textRaw: string, filename: string | null): SitemapSfParseResult {
  let text = textRaw.replace(/^﻿/, "");
  // Skip an optional banner line before the real header.
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

  let sitemapFiles = 0;
  let contentUrls = 0;
  let indexable = 0;
  let nonIndexable = 0;
  let non200 = 0;
  const counts: Record<string, { label: string; severity: "high" | "medium" | "low"; count: number }> = {};
  const problems: SitemapSfProblem[] = [];

  for (const rec of result.data as Record<string, string>[]) {
    const url = pick(rec, URL_KEYS);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const ct = normalizeKey(pick(rec, CT_KEYS));
    const http = pick(rec, HTTP_KEYS);
    const indexabilityRaw = normalizeKey(pick(rec, INDEXABILITY_KEYS));
    const reason = pick(rec, INDEX_STATUS_KEYS);

    // The sitemap files themselves (sitemap-index children) : count the
    // structure but don't treat them as page URLs.
    const isSitemapFile = ct.includes("xml") || /\.(xml|kml)(\?|#|$)/i.test(url);
    if (isSitemapFile) {
      sitemapFiles++;
      continue;
    }

    contentUrls++;
    const isIndexable = indexabilityRaw.startsWith("indexable");
    if (isIndexable) indexable++;
    else nonIndexable++;
    if (http && http.trim() !== "200") non200++;

    const cls = classify(isIndexable, reason, http);
    if (cls) {
      if (!counts[cls.key]) counts[cls.key] = { label: cls.label, severity: cls.severity, count: 0 };
      counts[cls.key].count++;
      problems.push({ url, problem: cls.label, http: http || "", severity: cls.severity });
    }
  }

  const breakdown = BREAKDOWN_ORDER.filter((k) => counts[k])
    .map((k) => ({ key: k, label: counts[k].label, count: counts[k].count }));

  return {
    stats: {
      filename,
      total_rows: contentUrls + sitemapFiles,
      sitemap_file_count: sitemapFiles,
      content_url_count: contentUrls,
      indexable_count: indexable,
      non_indexable_count: nonIndexable,
      non_200_count: non200,
      breakdown,
      problems,
    },
  };
}
