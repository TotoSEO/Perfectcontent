// Parse Screaming Frog `internal_all.csv` (or any internal HTML export) into
// a normalized list of UrlRow objects. Tolerates:
// - column-name variations across SF versions
// - UTF-8 BOM
// - CSV delimiter ',', ';' or '\t' (French Excel re-exports use ';')
// - a metadata banner row above the header (some SF wrappers prepend it)

import Papa from "papaparse";

export type UrlRow = {
  url: string;
  status_code: number | null;
  status: string | null;
  content_type: string | null;
  indexability: string | null;
  indexability_status: string | null;
  title: string | null;
  title_length: number | null;
  meta_description: string | null;
  meta_description_length: number | null;
  h1: string | null;
  h1_length: number | null;
  h1_2: string | null;
  h2_1: string | null;
  word_count: number | null;
  crawl_depth: number | null;
  inlinks: number | null;
  unique_inlinks: number | null;
  outlinks: number | null;
  unique_outlinks: number | null;
  canonical: string | null;
  redirect_url: string | null;
  size_bytes: number | null;
  response_time: number | null;
  hash: string | null;
};

const COL_ALIASES: Record<keyof UrlRow, string[]> = {
  url:                     [
    "address", "url", "uri", "page", "page url",
    // FR
    "adresse",
  ],
  status_code:             [
    "status code", "http status", "status",
    // FR
    "code http", "code de statut", "code de statut http",
  ],
  status:                  [
    "status", "http status text",
    // FR
    "statut", "statut http",
  ],
  content_type:            [
    "content type", "content-type",
    // FR
    "type de contenu", "type contenu", "type mime",
  ],
  indexability:            [
    "indexability",
    // FR
    "indexabilite", "indexabilité",
  ],
  indexability_status:     [
    "indexability status",
    // FR — apostrophe variations: ' ’ ´
    "statut d indexabilite", "statut d'indexabilite", "statut d’indexabilite",
    "statut d indexabilité", "statut d'indexabilité", "statut d’indexabilité",
    "statut de l indexabilite", "statut de l'indexabilite",
  ],
  title:                   [
    "title 1", "title", "page title", "title tag",
    // FR — Screaming Frog FR keeps the column name "title 1"
    "balise title 1", "balise title",
  ],
  title_length:            [
    "title 1 length", "title length", "title 1 (length)",
    // FR
    "longueur du title 1", "longueur du title", "longueur title 1",
    "longueur de la balise title 1", "longueur de la balise title",
  ],
  meta_description:        [
    "meta description 1", "meta description", "description",
    // FR (often kept in English)
  ],
  meta_description_length: [
    "meta description 1 length", "meta description length",
    // FR
    "longueur de la meta description 1", "longueur de la meta description",
    "longueur meta description 1",
  ],
  h1:                      [
    "h1-1", "h1", "h1 1",
  ],
  h1_length:               [
    "h1-1 length", "h1 length", "h1-1 (length)",
    // FR
    "longueur du h1-1", "longueur du h1", "longueur h1-1", "longueur h1",
  ],
  h1_2:                    [
    "h1-2", "h1 2",
  ],
  h2_1:                    [
    "h2-1", "h2", "h2 1",
  ],
  word_count:              [
    "word count", "words", "word-count",
    // FR
    "nombre de mots", "nb de mots", "nb mots", "comptage de mots",
  ],
  crawl_depth:             [
    "crawl depth", "depth", "level",
    // FR
    "profondeur de crawl", "profondeur d exploration", "profondeur d'exploration",
    "profondeur d’exploration", "profondeur", "niveau",
  ],
  inlinks:                 [
    "inlinks", "internal inlinks", "in links",
    // FR
    "liens entrants", "liens internes entrants", "nombre de liens entrants",
  ],
  unique_inlinks:          [
    "unique inlinks",
    // FR
    "liens entrants uniques", "liens entrants distincts",
  ],
  outlinks:                [
    "outlinks", "internal outlinks", "out links",
    // FR
    "liens sortants", "liens internes sortants", "nombre de liens sortants",
  ],
  unique_outlinks:         [
    "unique outlinks",
    // FR
    "liens sortants uniques", "liens sortants distincts",
  ],
  canonical:               [
    "canonical link element 1", "canonical link element", "canonical", "canonical url",
    // FR
    "element de lien canonique 1", "élément de lien canonique 1",
    "element de lien canonique", "élément de lien canonique",
    "lien canonique 1", "lien canonique", "url canonique", "canonique",
  ],
  redirect_url:            [
    "redirect url", "redirect uri", "redirect to",
    // FR
    "url de redirection", "url redirigee", "url redirigée", "redirection",
  ],
  size_bytes:              [
    "size (bytes)", "size", "size bytes",
    // FR
    "taille (octets)", "taille octets", "taille en octets", "taille",
  ],
  response_time:           [
    "response time", "response time (s)",
    // FR
    "temps de reponse", "temps de réponse", "temps de reponse (s)",
  ],
  hash:                    [
    "hash",
  ],
};

// Some SF exports prepend a banner row (file name, generated date) before the
// real header. We detect the header row by looking for a row that contains an
// "Address" or "URL" / "Adresse" column.
const URL_HEADERS = new Set(["address", "url", "uri", "page", "page url", "adresse"]);

function normalizeKey(s: string): string {
  // Lower-case, strip BOM, strip diacritics, normalize apostrophe-like
  // characters and collapse whitespace — so "Indexabilité" and "indexabilite"
  // both resolve to "indexabilite".
  return s
    .toLowerCase()
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‚‛ʼ]/g, "'")  // smart apostrophes → '
    .replace(/\s+/g, " ")
    .trim();
}

function pick(rec: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const key = normalizeKey(a);
    const v = rec[key];
    if (v !== undefined && v !== "" && v !== "—") return v;
  }
  return null;
}

function num(s: string | null): number | null {
  if (s === null || s === "" || s === "—") return null;
  const v = Number(String(s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

export type ParseStats = {
  total_rows: number;
  html_rows: number;
  filename: string | null;
  headers: string[];        // column headers detected (lower-case)
  delimiter: string;        // delimiter used
  banner_skipped: number;   // metadata rows skipped before the header
  rows_without_url: number; // rows we couldn't extract a URL from
};

export type ParseResult = {
  rows: UrlRow[];
  stats: ParseStats;
};

export async function parseInternalCsv(file: File): Promise<ParseResult> {
  const text = await file.text();
  return parseInternalCsvText(text, file.name);
}

export function parseInternalCsvText(textRaw: string, filename: string | null): ParseResult {
  // 1. Strip UTF-8 BOM if present
  let text = textRaw.replace(/^﻿/, "");

  // 2. Skip a leading metadata banner: walk forward line by line until we
  //    find a line that contains a URL-like header. SF "Top Reports" exports
  //    sometimes have a "Spider Crawl by ..." banner above the header.
  let banner_skipped = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const probe = normalizeKey(lines[i]);
    const firstCol = probe.split(/[,;\t]/)[0]?.replace(/^"|"$/g, "").trim() || "";
    if (URL_HEADERS.has(firstCol)) {
      // already at header
      break;
    }
    // Detect "header-y" line (contains both a URL column AND another known col).
    // Works for both English and French Screaming Frog exports.
    const hasUrlCol =
      probe.includes("address") || probe.includes("url") || probe.includes("uri") ||
      probe.includes("adresse");
    const hasOtherCol =
      probe.includes("status") || probe.includes("title") || probe.includes("indexability") ||
      probe.includes("statut") || probe.includes("indexabilite") || probe.includes("code http");
    if (hasUrlCol && hasOtherCol) {
      banner_skipped = i;
      break;
    }
    if (i === 4) banner_skipped = 0; // give up, keep original
  }
  if (banner_skipped > 0) {
    text = lines.slice(banner_skipped).join("\n");
  }

  // 3. Auto-detect delimiter (comma / semicolon / tab) and parse with header
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: (h) => normalizeKey(h),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const headers = (result.meta.fields || []).map(normalizeKey);
  const delimiter = result.meta.delimiter || ",";

  const rows: UrlRow[] = [];
  let html_rows = 0;
  let rows_without_url = 0;

  for (const rec of (result.data as Record<string, string>[])) {
    const url = pick(rec, COL_ALIASES.url);
    if (!url || !/^https?:\/\//i.test(url)) {
      rows_without_url++;
      continue;
    }
    const ct = pick(rec, COL_ALIASES.content_type);
    if (ct && /text\/html/i.test(ct)) html_rows++;
    rows.push({
      url,
      status_code: num(pick(rec, COL_ALIASES.status_code)),
      status: pick(rec, COL_ALIASES.status),
      content_type: ct,
      indexability: pick(rec, COL_ALIASES.indexability),
      indexability_status: pick(rec, COL_ALIASES.indexability_status),
      title: pick(rec, COL_ALIASES.title),
      title_length: num(pick(rec, COL_ALIASES.title_length)),
      meta_description: pick(rec, COL_ALIASES.meta_description),
      meta_description_length: num(pick(rec, COL_ALIASES.meta_description_length)),
      h1: pick(rec, COL_ALIASES.h1),
      h1_length: num(pick(rec, COL_ALIASES.h1_length)),
      h1_2: pick(rec, COL_ALIASES.h1_2),
      h2_1: pick(rec, COL_ALIASES.h2_1),
      word_count: num(pick(rec, COL_ALIASES.word_count)),
      crawl_depth: num(pick(rec, COL_ALIASES.crawl_depth)),
      inlinks: num(pick(rec, COL_ALIASES.inlinks)),
      unique_inlinks: num(pick(rec, COL_ALIASES.unique_inlinks)),
      outlinks: num(pick(rec, COL_ALIASES.outlinks)),
      unique_outlinks: num(pick(rec, COL_ALIASES.unique_outlinks)),
      canonical: pick(rec, COL_ALIASES.canonical),
      redirect_url: pick(rec, COL_ALIASES.redirect_url),
      size_bytes: num(pick(rec, COL_ALIASES.size_bytes)),
      response_time: num(pick(rec, COL_ALIASES.response_time)),
      hash: pick(rec, COL_ALIASES.hash),
    });
  }

  return {
    rows,
    stats: {
      total_rows: rows.length,
      html_rows,
      filename,
      headers,
      delimiter,
      banner_skipped,
      rows_without_url,
    },
  };
}
