// Parse Screaming Frog `internal_all.csv` (or any internal HTML export) into
// a normalized list of UrlRow objects. Tolerates the column-name variations
// SF has shipped over different versions.

import Papa from "papaparse";

export type UrlRow = {
  url: string;
  status_code: number | null;
  status: string | null;          // e.g. "OK", "Not Found", "Moved Permanently"
  content_type: string | null;
  indexability: string | null;    // "Indexable" / "Non-Indexable"
  indexability_status: string | null; // why non-indexable
  title: string | null;
  title_length: number | null;
  meta_description: string | null;
  meta_description_length: number | null;
  h1: string | null;
  h1_length: number | null;
  h1_2: string | null;            // 2nd H1 if present
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
  url:                     ["Address"],
  status_code:             ["Status Code"],
  status:                  ["Status"],
  content_type:            ["Content Type"],
  indexability:            ["Indexability"],
  indexability_status:     ["Indexability Status"],
  title:                   ["Title 1", "Title"],
  title_length:            ["Title 1 Length", "Title Length"],
  meta_description:        ["Meta Description 1", "Meta Description"],
  meta_description_length: ["Meta Description 1 Length", "Meta Description Length"],
  h1:                      ["H1-1", "H1"],
  h1_length:               ["H1-1 Length", "H1 Length"],
  h1_2:                    ["H1-2"],
  h2_1:                    ["H2-1", "H2"],
  word_count:              ["Word Count"],
  crawl_depth:             ["Crawl Depth"],
  inlinks:                 ["Inlinks"],
  unique_inlinks:          ["Unique Inlinks"],
  outlinks:                ["Outlinks"],
  unique_outlinks:         ["Unique Outlinks"],
  canonical:               ["Canonical Link Element 1", "Canonical Link Element", "Canonical"],
  redirect_url:            ["Redirect URL", "Redirect URI"],
  size_bytes:              ["Size (bytes)", "Size"],
  response_time:           ["Response Time"],
  hash:                    ["Hash"],
};

function pick(rec: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    if (rec[a] !== undefined && rec[a] !== "") return rec[a];
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
};

export type ParseResult = {
  rows: UrlRow[];
  stats: ParseStats;
};

/**
 * Parse a SF internal_all.csv (or any compatible export). Returns ALL rows
 * found — not just HTML. The analyzer filters appropriately.
 */
export async function parseInternalCsv(file: File): Promise<ParseResult> {
  const text = await file.text();
  return parseInternalCsvText(text, file.name);
}

export function parseInternalCsvText(text: string, filename: string | null): ParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const rows: UrlRow[] = [];
  let html_rows = 0;
  for (const rec of result.data as Record<string, string>[]) {
    const url = pick(rec, COL_ALIASES.url);
    if (!url) continue;
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
    stats: { total_rows: rows.length, html_rows, filename },
  };
}
