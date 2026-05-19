// Parse Screaming Frog FR Images > Tous (images_tous.csv). Gives us every
// image discovered during the crawl with its size + how many pages
// reference it — the ground truth for the "Poids des images" slide
// (the Issues ZIP only flags images > 100 Ko, which is too coarse).

import Papa from "papaparse";

export type ImageRow = {
  url: string;
  size_bytes: number | null;
  inlinks_img: number | null;     // pages that include this image
  dimensions: string | null;      // "1920x1080" or similar
  width: number | null;
  height: number | null;
};

const URL_KEYS = ["adresse", "address", "url"];
const SIZE_KEYS = ["taille (octets)", "taille octets", "taille", "size (bytes)", "size", "size bytes"];
const INLINKS_KEYS = ["liens entrants img", "img inlinks", "image inlinks"];
const DIMENSIONS_KEYS = ["dimensions", "dimension"];

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

function num(s: string | null): number | null {
  if (s === null || s === "" || s === "—") return null;
  const v = Number(String(s).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

function parseDimensions(d: string | null): { width: number | null; height: number | null } {
  if (!d) return { width: null, height: null };
  // SF format is usually "1920 x 1080" or "1920x1080"
  const m = d.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  return { width: null, height: null };
}

export type ImagesAllParseResult = {
  rows: ImageRow[];
  total_count: number;
  filename: string | null;
};

export async function parseImagesAllCsv(file: File): Promise<ImagesAllParseResult> {
  const text = await file.text();
  return parseImagesAllCsvText(text, file.name);
}

export function parseImagesAllCsvText(textRaw: string, filename: string | null): ImagesAllParseResult {
  let text = textRaw.replace(/^﻿/, "");
  // Some Screaming Frog exports prepend a banner line ("Spider Export …")
  // before the real header row. Walk down to the row that contains an
  // Adresse / Address / URL column header.
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

  const rows: ImageRow[] = [];
  for (const rec of result.data as Record<string, string>[]) {
    const url = pick(rec, URL_KEYS);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const dims = parseDimensions(pick(rec, DIMENSIONS_KEYS));
    rows.push({
      url,
      size_bytes: num(pick(rec, SIZE_KEYS)),
      inlinks_img: num(pick(rec, INLINKS_KEYS)),
      dimensions: pick(rec, DIMENSIONS_KEYS),
      width: dims.width,
      height: dims.height,
    });
  }

  return { rows, total_count: rows.length, filename };
}
