// Parse the Screaming Frog FR "Interne > HTML" export. The user has the paid
// version, so the export carries the full set of pixel widths / sizes /
// canonical / response time / depth columns. We accept both English and FR
// column names so the user can switch locales without re-uploading.

import Papa from "papaparse";

export type InternalRow = {
  url: string;
  content_type: string | null;
  status_code: number | null;
  status: string | null;
  indexability: string | null;
  indexability_status: string | null;
  title: string | null;
  title_length: number | null;
  title_pixel_width: number | null;
  meta_description: string | null;
  meta_description_length: number | null;
  meta_description_pixel_width: number | null;
  h1: string | null;
  h1_length: number | null;
  h2: string | null;
  h2_length: number | null;
  size_bytes: number | null;          // HTML file size on disk
  transferred_bytes: number | null;   // Bytes actually transferred (gzipped)
  crawl_depth: number | null;
  inlinks: number | null;
  unique_inlinks: number | null;
  outlinks: number | null;
  unique_outlinks: number | null;
  response_time: number | null;       // in seconds
  canonical: string | null;
};

const COL_ALIASES: Record<keyof InternalRow, string[]> = {
  url: ["adresse", "address", "url", "uri", "page", "page url"],
  content_type: ["type de contenu", "content type", "content-type"],
  status_code: ["code http", "status code", "http status", "code de statut", "code de statut http"],
  status: ["statut", "status", "http status text"],
  indexability: ["indexabilite", "indexability"],
  indexability_status: [
    "statut d indexabilite", "statut d'indexabilite", "statut d'indexabilite",
    "statut de l indexabilite", "statut de l'indexabilite",
    "indexability status",
  ],
  title: ["title 1", "title", "page title", "balise title 1", "balise title"],
  title_length: [
    "longueur du title 1", "longueur du title", "longueur title 1",
    "title 1 length", "title length",
  ],
  title_pixel_width: [
    "largeur en pixels du title 1", "largeur en pixels du title",
    "title 1 pixel width", "title pixel width",
  ],
  meta_description: ["meta description 1", "meta description", "description"],
  meta_description_length: [
    "longueur de la meta description 1", "longueur de la meta description",
    "meta description 1 length", "meta description length",
  ],
  meta_description_pixel_width: [
    "largeur en pixels de la meta description 1", "largeur en pixels de la meta description",
    "meta description 1 pixel width", "meta description pixel width",
  ],
  h1: ["h1-1", "h1", "h1 1"],
  h1_length: [
    "longueur du h1-1", "longueur du h1", "longueur h1-1", "longueur h1",
    "h1-1 length", "h1 length",
  ],
  h2: ["h2-1", "h2", "h2 1"],
  h2_length: [
    "longueur du h2-1", "longueur du h2", "longueur h2-1",
    "h2-1 length", "h2 length",
  ],
  size_bytes: [
    "taille (octets)", "taille octets", "taille en octets", "taille",
    "size (bytes)", "size", "size bytes",
  ],
  transferred_bytes: [
    "transfere (octets)", "transfere octets", "transfere",
    "transferre (octets)",
    "transferred (bytes)", "transferred bytes", "transferred", "bytes transferred",
  ],
  crawl_depth: [
    "crawl profondeur", "profondeur de crawl", "profondeur d exploration",
    "profondeur d'exploration", "profondeur", "niveau",
    "crawl depth", "depth", "level",
  ],
  inlinks: ["liens entrants", "inlinks", "internal inlinks", "in links"],
  unique_inlinks: [
    "liens entrants uniques", "liens entrants distincts",
    "unique inlinks",
  ],
  outlinks: ["liens sortants", "outlinks", "internal outlinks", "out links"],
  unique_outlinks: [
    "liens sortants uniques", "liens sortants distincts",
    "unique outlinks",
  ],
  response_time: [
    "temps de reponse", "temps de reponse (s)",
    "response time", "response time (s)",
  ],
  canonical: [
    "element de lien en version canonique 1", "element de lien en version canonique",
    "lien en version canonique 1", "lien en version canonique",
    "element de lien canonique 1", "element de lien canonique",
    "lien canonique 1", "lien canonique", "url canonique", "canonique",
    "canonical link element 1", "canonical link element", "canonical", "canonical url",
  ],
};

const URL_HEADERS = new Set(["adresse", "address", "url", "uri", "page", "page url"]);

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
    if (v !== undefined && v !== "" && v !== ",") return v;
  }
  return null;
}

function num(s: string | null): number | null {
  if (s === null || s === "" || s === ",") return null;
  // SF FR uses comma as decimal separator: "1,2" → 1.2
  const v = Number(String(s).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

export type InternalParseStats = {
  total_rows: number;
  html_rows: number;
  filename: string | null;
  headers: string[];
  delimiter: string;
  rows_without_url: number;
  pagination_skipped: number;
};

export type InternalParseResult = {
  rows: InternalRow[];
  stats: InternalParseStats;
};

export async function parseInterneHtmlCsv(file: File): Promise<InternalParseResult> {
  const text = await file.text();
  return parseInterneHtmlCsvText(text, file.name);
}

export function parseInterneHtmlCsvText(textRaw: string, filename: string | null): InternalParseResult {
  let text = textRaw.replace(/^﻿/, "");

  // Skip leading SF banner row if present (rare but happens with "Top Reports").
  const lines = text.split(/\r?\n/);
  let banner = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const probe = normalizeKey(lines[i]);
    const firstCol = probe.split(/[,;\t]/)[0]?.replace(/^"|"$/g, "").trim() || "";
    if (URL_HEADERS.has(firstCol)) break;
    const hasUrlCol = /(adresse|address|url|uri)/.test(probe);
    const hasOtherCol = /(status|title|indexabili|statut|code http)/.test(probe);
    if (hasUrlCol && hasOtherCol) { banner = i; break; }
  }
  if (banner > 0) text = lines.slice(banner).join("\n");

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: normalizeKey,
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const headers = (result.meta.fields || []).map(normalizeKey);
  const delimiter = result.meta.delimiter || ",";

  const rows: InternalRow[] = [];
  let html = 0;
  let rows_without_url = 0;
  let pagination_skipped = 0;
  for (const rec of result.data as Record<string, string>[]) {
    const url = pick(rec, COL_ALIASES.url);
    if (!url || !/^https?:\/\//i.test(url)) { rows_without_url++; continue; }
    if (isPaginationUrl(url)) { pagination_skipped++; continue; }
    const ct = pick(rec, COL_ALIASES.content_type);
    if (ct && /text\/html/i.test(ct)) html++;
    rows.push({
      url,
      content_type: ct,
      status_code: num(pick(rec, COL_ALIASES.status_code)),
      status: pick(rec, COL_ALIASES.status),
      indexability: pick(rec, COL_ALIASES.indexability),
      indexability_status: pick(rec, COL_ALIASES.indexability_status),
      title: pick(rec, COL_ALIASES.title),
      title_length: num(pick(rec, COL_ALIASES.title_length)),
      title_pixel_width: num(pick(rec, COL_ALIASES.title_pixel_width)),
      meta_description: pick(rec, COL_ALIASES.meta_description),
      meta_description_length: num(pick(rec, COL_ALIASES.meta_description_length)),
      meta_description_pixel_width: num(pick(rec, COL_ALIASES.meta_description_pixel_width)),
      h1: pick(rec, COL_ALIASES.h1),
      h1_length: num(pick(rec, COL_ALIASES.h1_length)),
      h2: pick(rec, COL_ALIASES.h2),
      h2_length: num(pick(rec, COL_ALIASES.h2_length)),
      size_bytes: num(pick(rec, COL_ALIASES.size_bytes)),
      transferred_bytes: num(pick(rec, COL_ALIASES.transferred_bytes)),
      crawl_depth: num(pick(rec, COL_ALIASES.crawl_depth)),
      inlinks: num(pick(rec, COL_ALIASES.inlinks)),
      unique_inlinks: num(pick(rec, COL_ALIASES.unique_inlinks)),
      outlinks: num(pick(rec, COL_ALIASES.outlinks)),
      unique_outlinks: num(pick(rec, COL_ALIASES.unique_outlinks)),
      response_time: num(pick(rec, COL_ALIASES.response_time)),
      canonical: pick(rec, COL_ALIASES.canonical),
    });
  }

  return {
    rows,
    stats: {
      total_rows: rows.length,
      html_rows: html,
      filename,
      headers,
      delimiter,
      rows_without_url,
      pagination_skipped,
    },
  };
}

// Pagination URLs (?page=2, ?p=3, /page/4/, /p/4, ?paged=N…) inflate the
// URL count and pollute every distribution downstream — same template,
// same content, same internal links. Reference page (page 1, no
// parameter) is always kept; only the deeper paginated copies are
// filtered out at parse time.
//
// Spec regex from the client : /(page|p)/\d+/?$|[?&](page|p)=\d+
// We extend it with `pagination`, `paged`, `start`, `offset` since
// some templates use those variants.
export function isPaginationUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    for (const key of ["pagination", "page", "paged", "p", "start", "offset"]) {
      const v = params.get(key);
      if (v && /^\d+$/.test(v)) return true;
    }
    // Match both /page/N(/) and /p/N(/) as path-based pagination.
    if (/\/(page|p)\/\d+\/?$/i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

// Extract the site root domain from the first HTML URL we see. Used for
// fetching robots.txt / sitemap.xml / llms.txt server-side.
export function inferDomain(rows: InternalRow[]): string | null {
  for (const r of rows) {
    try {
      const u = new URL(r.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      continue;
    }
  }
  return null;
}
