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
  url:                     ["address", "url", "uri", "page", "page url"],
  status_code:             ["status code", "http status", "status"],
  status:                  ["status", "http status text"],
  content_type:            ["content type", "content-type"],
  indexability:            ["indexability"],
  indexability_status:     ["indexability status"],
  title:                   ["title 1", "title", "page title", "title tag"],
  title_length:            ["title 1 length", "title length", "title 1 (length)"],
  meta_description:        ["meta description 1", "meta description", "description"],
  meta_description_length: ["meta description 1 length", "meta description length"],
  h1:                      ["h1-1", "h1", "h1 1"],
  h1_length:               ["h1-1 length", "h1 length", "h1-1 (length)"],
  h1_2:                    ["h1-2", "h1 2"],
  h2_1:                    ["h2-1", "h2", "h2 1"],
  word_count:              ["word count", "words", "word-count"],
  crawl_depth:             ["crawl depth", "depth", "level"],
  inlinks:                 ["inlinks", "internal inlinks", "in links"],
  unique_inlinks:          ["unique inlinks"],
  outlinks:                ["outlinks", "internal outlinks", "out links"],
  unique_outlinks:         ["unique outlinks"],
  canonical:               ["canonical link element 1", "canonical link element", "canonical", "canonical url"],
  redirect_url:            ["redirect url", "redirect uri", "redirect to"],
  size_bytes:              ["size (bytes)", "size", "size bytes"],
  response_time:           ["response time", "response time (s)"],
  hash:                    ["hash"],
};

// Some SF exports prepend a banner row (file name, generated date) before the
// real header. We detect the header row by looking for a row that contains an
// "Address" or "URL" column.
const URL_HEADERS = new Set(["address", "url", "uri", "page", "page url"]);

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/^﻿/, "").trim();
}

function pick(rec: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const v = rec[a];
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
    const probe = lines[i].toLowerCase();
    if (URL_HEADERS.has(probe.split(/[,;\t]/)[0]?.replace(/^"|"$/g, "").trim() || "")) {
      // already at header
      break;
    }
    // Detect "header-y" line (contains both "address" or "url" AND another known col)
    if ((probe.includes("address") || probe.includes("url") || probe.includes("uri")) &&
        (probe.includes("status") || probe.includes("title") || probe.includes("indexability"))) {
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
