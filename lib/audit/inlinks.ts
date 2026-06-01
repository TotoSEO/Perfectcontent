// Optional second SF export: `all_inlinks.csv` (Bulk Export > Links >
// All Inlinks). Contains one row per (source, destination) link pair plus
// a "Link Position" column with values like Header / Body / Footer /
// Navigation / Sidebar. Used to compute *contextual* inlinks per page : // i.e. only links from the article body, ignoring the boilerplate that
// every page on the site emits.

import Papa from "papaparse";

export type InlinksMap = Map<string, number>; // destination URL → contextual inlinks count

const POSITION_KEYS = [
  "link position", "position",
  "position du lien", "emplacement du lien",
];
const DEST_KEYS = [
  "destination", "to",
  "destination url", "to url",
  "url de destination", "destination uri",
];
const STATUS_KEYS = [
  "status code", "status",
  "code http", "statut",
];

// Body-equivalent positions across SF locales. Anything else (Header,
// Footer, Nav, Sidebar, Aside) is treated as boilerplate and excluded.
const BODY_POSITIONS = new Set([
  "body", "content", "main", "article",
  "corps", "contenu", "principal",
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

function pick(row: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const k = normalizeKey(a);
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return null;
}

export type InlinksParseResult = {
  map: InlinksMap;
  total_rows: number;
  body_rows: number;
  has_position: boolean;
  filename: string | null;
};

export async function parseInlinksCsv(file: File): Promise<InlinksParseResult> {
  const text = await file.text();
  return parseInlinksCsvText(text, file.name);
}

export function parseInlinksCsvText(textRaw: string, filename: string | null): InlinksParseResult {
  const text = textRaw.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: normalizeKey,
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const map: InlinksMap = new Map();
  let total = 0;
  let body = 0;

  // Detect once whether any row has a position column.
  const sample = result.data[0] as Record<string, string> | undefined;
  const has_position = !!sample && POSITION_KEYS.some((k) => sample[normalizeKey(k)] !== undefined);

  for (const rec of result.data as Record<string, string>[]) {
    const dest = pick(rec, DEST_KEYS);
    if (!dest || !/^https?:\/\//i.test(dest)) continue;
    total++;
    // Skip non-200 inlinks (broken / redirected) : they don't count as real inlinks.
    const sc = pick(rec, STATUS_KEYS);
    const code = sc ? parseInt(sc, 10) : 200;
    if (code >= 300) continue;
    if (has_position) {
      const pos = normalizeKey(pick(rec, POSITION_KEYS) || "");
      // Anything that resolves to a body-like position counts; drop the rest.
      if (!BODY_POSITIONS.has(pos)) continue;
    }
    body++;
    map.set(dest, (map.get(dest) || 0) + 1);
  }

  return { map, total_rows: total, body_rows: body, has_position, filename };
}
