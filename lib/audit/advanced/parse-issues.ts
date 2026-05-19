// Parse Screaming Frog FR "Exporter en bloc > Problèmes > Tous" ZIP archive.
// The ZIP contains 60+ CSVs but we only need a whitelist of ~25 of them ,
// the rest are ignored to keep parsing fast and the memory footprint small.
// Each whitelisted filename maps to a normalized issue category that the
// analyzer consumes for one specific slide.

import Papa from "papaparse";
import type { Severity } from "../types";

export type IssueLine = {
  // The "Adresse" / "Address" column : primary URL. Always present.
  url: string;
  // Free-form extra columns kept as strings (we let the analyzer pull what it
  // needs by key : we don't typecast at parse time because each issue CSV has
  // a different schema).
  extras: Record<string, string>;
};

export type ParsedIssue = {
  // Stable id used everywhere downstream (matches the keys in ISSUE_MAP).
  id: string;
  // Original filename inside the ZIP (with .csv extension).
  filename: string;
  // Short human label rendered in the XLSX tab name.
  short_label: string;
  // Severity assigned by us (not by SF : SF only tags warnings/issues/opps).
  severity: Severity;
  // Logical group used by the analyzer to dispatch to the right slide.
  group:
    | "http-internal" | "http-external" | "robots-blocked"
    | "h1" | "h2" | "title" | "meta"
    | "hreflang" | "canonical"
    | "image-alt" | "image-size" | "image-weight"
    | "url-issue" | "security" | "directive"
    | "content" | "link-empty-anchor"
    | "noindex" | "redirect"
    | "overview";
  rows: IssueLine[];
};

// Mapping FR filename → normalized issue.
// label = used in XLSX tab name (sheets are also capped to 31 chars by Excel).
// group = drives where the issue lands in the slide deck.
const ISSUE_MAP: Array<{
  id: string;
  filename_patterns: string[];
  short_label: string;
  severity: Severity;
  group: ParsedIssue["group"];
}> = [
  // ===== HTTP codes (internal) =====
  {
    id: "http_internal_client_error",
    filename_patterns: ["codes_de_reponse_internes_erreur_du_client.csv", "codes_de_reponse_internes_erreur_client.csv"],
    short_label: "404 internes",
    severity: "critical",
    group: "http-internal",
  },
  {
    id: "http_internal_redirection",
    filename_patterns: ["codes_de_reponse_internes_redirection.csv"],
    short_label: "Redirections internes",
    severity: "medium",
    group: "http-internal",
  },
  {
    id: "http_internal_blocked_robots",
    filename_patterns: ["codes_de_reponse_internes_bloquees_par_robots.csv", "codes_de_reponse_internes_bloque_par_robots.csv"],
    short_label: "Bloquées robots",
    severity: "medium",
    group: "robots-blocked",
  },
  // ===== HTTP codes (external) =====
  {
    id: "http_external_server_error",
    filename_patterns: ["codes_de_reponse_externes_erreur_de_serveur.csv", "codes_de_reponse_externes_erreur_serveur.csv"],
    short_label: "5xx externes",
    severity: "high",
    group: "http-external",
  },
  {
    id: "http_external_client_error",
    filename_patterns: ["codes_de_reponse_externes_erreur_du_client.csv", "codes_de_reponse_externes_erreur_client.csv"],
    short_label: "404 externes",
    severity: "high",
    group: "http-external",
  },
  {
    id: "http_external_no_response",
    filename_patterns: ["codes_de_reponse_externes_pas_de_reponse.csv"],
    short_label: "Pas de réponse externe",
    severity: "medium",
    group: "http-external",
  },
  {
    id: "http_inlinks_external",
    filename_patterns: ["codes_de_reponse_liens_entrants_externes.csv"],
    short_label: "Liens entrants externes",
    severity: "low",
    group: "http-external",
  },
  {
    id: "http_inlinks_internal",
    filename_patterns: ["codes_de_reponse_liens_entrants_internes.csv"],
    short_label: "Liens entrants internes (issues)",
    severity: "low",
    group: "http-internal",
  },
  // ===== Titles =====
  {
    id: "title_duplicate",
    filename_patterns: ["title_des_pages_doublon.csv"],
    short_label: "Titles dupliqués",
    severity: "high",
    group: "title",
  },
  {
    id: "title_short_chars",
    filename_patterns: ["title_des_pages_moins_de_30_caracteres.csv"],
    short_label: "Titles courts (<30c)",
    severity: "low",
    group: "title",
  },
  {
    id: "title_long_chars",
    filename_patterns: ["title_des_pages_plus_de_60_caracteres.csv"],
    short_label: "Titles longs (>60c)",
    severity: "low",
    group: "title",
  },
  {
    id: "title_short_pixels",
    filename_patterns: ["title_des_pages_moins_de_200_pixels.csv"],
    short_label: "Titles <200px",
    severity: "low",
    group: "title",
  },
  {
    id: "title_long_pixels",
    filename_patterns: ["title_des_pages_plus_de_561_pixels.csv"],
    short_label: "Titles >561px",
    severity: "medium",
    group: "title",
  },
  {
    id: "title_same_as_h1",
    filename_patterns: ["title_des_pages_identique_a_h1.csv"],
    short_label: "Title = H1",
    severity: "low",
    group: "title",
  },
  // ===== Meta description =====
  {
    id: "meta_missing",
    filename_patterns: ["meta_description_manquant.csv"],
    short_label: "Meta manquantes",
    severity: "medium",
    group: "meta",
  },
  {
    id: "meta_duplicate",
    filename_patterns: ["meta_description_doublon.csv"],
    short_label: "Meta dupliquées",
    severity: "high",
    group: "meta",
  },
  {
    id: "meta_short_chars",
    filename_patterns: ["meta_description_moins_de_70_caracteres.csv"],
    short_label: "Meta courtes (<70c)",
    severity: "low",
    group: "meta",
  },
  {
    id: "meta_long_chars",
    filename_patterns: ["meta_description_plus_de_155_caracteres.csv"],
    short_label: "Meta longues (>155c)",
    severity: "low",
    group: "meta",
  },
  {
    id: "meta_short_pixels",
    filename_patterns: ["meta_description_moins_de_400_pixels.csv"],
    short_label: "Meta <400px",
    severity: "low",
    group: "meta",
  },
  {
    id: "meta_long_pixels",
    filename_patterns: ["meta_description_plus_de_985_pixels.csv"],
    short_label: "Meta >985px",
    severity: "low",
    group: "meta",
  },
  // ===== H1 =====
  {
    id: "h1_missing",
    filename_patterns: ["h1_manquant.csv"],
    short_label: "H1 manquants",
    severity: "high",
    group: "h1",
  },
  {
    id: "h1_duplicate",
    filename_patterns: ["h1_doublon.csv"],
    short_label: "H1 dupliqués",
    severity: "medium",
    group: "h1",
  },
  {
    id: "h1_long",
    filename_patterns: ["h1_plus_de_70_caracteres.csv"],
    short_label: "H1 >70c",
    severity: "low",
    group: "h1",
  },
  // ===== H2 =====
  {
    id: "h2_missing",
    filename_patterns: ["h2_manquant.csv"],
    short_label: "H2 manquants",
    severity: "medium",
    group: "h2",
  },
  {
    id: "h2_duplicate",
    filename_patterns: ["h2_doublon.csv"],
    short_label: "H2 dupliqués",
    severity: "low",
    group: "h2",
  },
  {
    id: "h2_multiple",
    filename_patterns: ["h2_multiple.csv"],
    short_label: "H2 multiples",
    severity: "low",
    group: "h2",
  },
  {
    id: "h2_long",
    filename_patterns: ["h2_plus_de_70_caracteres.csv"],
    short_label: "H2 >70c",
    severity: "low",
    group: "h2",
  },
  {
    id: "h2_non_sequential",
    filename_patterns: ["h2_non_sequentiel.csv"],
    short_label: "Sauts hiérarchie H2",
    severity: "medium",
    group: "h2",
  },
  // ===== Hreflang =====
  {
    id: "hreflang_xdefault_missing",
    filename_patterns: ["hreflang_xdefault_manquant.csv"],
    short_label: "Hreflang x-default manquant",
    severity: "medium",
    group: "hreflang",
  },
  {
    id: "hreflang_noindex_return",
    filename_patterns: ["hreflang_liens_de_retour_noindex.csv"],
    short_label: "Hreflang retour noindex",
    severity: "high",
    group: "hreflang",
  },
  {
    id: "hreflang_non200",
    filename_patterns: ["hreflang_url_hreflang_non200.csv"],
    short_label: "Hreflang URL non-200",
    severity: "high",
    group: "hreflang",
  },
  // ===== Canonical =====
  {
    id: "canonical_canonicalised",
    filename_patterns: ["versions_canoniques_canonise.csv"],
    short_label: "URLs canonisées",
    severity: "medium",
    group: "canonical",
  },
  {
    id: "canonical_inlinks_canonicalised",
    filename_patterns: ["versions_canoniques_liens_entrants_canoniques.csv"],
    short_label: "Liens vers URLs canonisées",
    severity: "low",
    group: "canonical",
  },
  // ===== Images =====
  {
    id: "image_alt_missing",
    filename_patterns: ["images_texte_alt_manquant.csv"],
    short_label: "Images sans alt",
    severity: "medium",
    group: "image-alt",
  },
  {
    id: "image_size_missing",
    filename_patterns: ["images_attributs_de_taille_manquants.csv"],
    short_label: "Images sans width/height",
    severity: "medium",
    group: "image-size",
  },
  {
    id: "image_heavy",
    filename_patterns: ["images_environ_100_ko.csv"],
    short_label: "Images >100 Ko",
    severity: "medium",
    group: "image-weight",
  },
  {
    id: "image_inlinks",
    filename_patterns: ["images_liens_entrants_vers_les_images.csv"],
    short_label: "Liens vers images",
    severity: "info",
    group: "image-weight",
  },
  // ===== URL issues =====
  {
    id: "url_long",
    filename_patterns: ["url_plus_de_115_caracteres.csv"],
    short_label: "URLs >115c",
    severity: "low",
    group: "url-issue",
  },
  {
    id: "url_underscores",
    filename_patterns: ["url_traits_de_soulignement.csv"],
    short_label: "URLs avec _",
    severity: "low",
    group: "url-issue",
  },
  {
    id: "url_non_ascii",
    filename_patterns: ["url_caracteres_non_ascii.csv"],
    short_label: "URLs non-ASCII",
    severity: "low",
    group: "url-issue",
  },
  {
    id: "url_multiple_slashes",
    filename_patterns: ["url_barres_obliques_multiples.csv"],
    short_label: "URLs //",
    severity: "low",
    group: "url-issue",
  },
  {
    id: "url_parameters",
    filename_patterns: ["url_parametres.csv"],
    short_label: "URLs avec ?param",
    severity: "low",
    group: "url-issue",
  },
  {
    id: "url_space",
    filename_patterns: ["url_contient_une_espace.csv"],
    short_label: "URLs avec espace",
    severity: "medium",
    group: "url-issue",
  },
  // ===== Security =====
  {
    id: "sec_http_url",
    filename_patterns: ["securite_url_http.csv"],
    short_label: "URLs en HTTP",
    severity: "high",
    group: "security",
  },
  {
    id: "sec_inlinks_http",
    filename_patterns: ["securite_liens_entrants_url_http.csv"],
    short_label: "Liens vers HTTP",
    severity: "medium",
    group: "security",
  },
  {
    id: "sec_no_hsts",
    filename_patterns: ["securite_entete_hsts_manquant.csv"],
    short_label: "HSTS manquant",
    severity: "low",
    group: "security",
  },
  {
    id: "sec_no_csp",
    filename_patterns: ["securite_entete_contentsecuritypolicy_manquant.csv"],
    short_label: "CSP manquant",
    severity: "info",
    group: "security",
  },
  {
    id: "sec_no_referrer",
    filename_patterns: ["securite_entete_secure_referrerpolicy_manquant.csv"],
    short_label: "Referrer Policy manquant",
    severity: "info",
    group: "security",
  },
  {
    id: "sec_crossorigin",
    filename_patterns: ["securite_liens_avec_attribut_crossorigin.csv"],
    short_label: "Liens crossorigin",
    severity: "info",
    group: "security",
  },
  // ===== Directives =====
  {
    id: "directive_noindex",
    filename_patterns: ["directives_noindex.csv"],
    short_label: "Noindex",
    severity: "high",
    group: "noindex",
  },
  {
    id: "directive_inlinks_noindex",
    filename_patterns: ["directives_liens_entrants_noindex.csv"],
    short_label: "Liens vers noindex",
    severity: "medium",
    group: "noindex",
  },
  {
    id: "directive_nofollow",
    filename_patterns: ["directives_nofollow.csv"],
    short_label: "Nofollow",
    severity: "low",
    group: "directive",
  },
  {
    id: "directive_inlinks_nofollow",
    filename_patterns: ["directives_liens_entrants_nofollow.csv"],
    short_label: "Liens nofollow",
    severity: "low",
    group: "directive",
  },
  {
    id: "directive_noimageindex",
    filename_patterns: ["directives_noimageindex.csv"],
    short_label: "Noimageindex",
    severity: "info",
    group: "directive",
  },
  {
    id: "directive_inlinks_noimageindex",
    filename_patterns: ["directives_liens_entrants_noimageindex.csv"],
    short_label: "Liens noimageindex",
    severity: "info",
    group: "directive",
  },
  // ===== Content =====
  {
    id: "content_thin",
    filename_patterns: ["contenu_pages_a_faible_contenu.csv"],
    short_label: "Pages contenu faible",
    severity: "medium",
    group: "content",
  },
  {
    id: "content_readability_difficult",
    filename_patterns: ["contenu_lisibilite_difficile.csv"],
    short_label: "Lisibilité difficile",
    severity: "low",
    group: "content",
  },
  {
    id: "content_readability_very_difficult",
    filename_patterns: ["contenu_lisibilite_tres_difficile.csv"],
    short_label: "Lisibilité très difficile",
    severity: "medium",
    group: "content",
  },
  // ===== Internal links =====
  {
    id: "internal_outlinks_no_anchor",
    filename_patterns: ["liens_liens_sortants_internes_sans_texte.csv"],
    short_label: "Liens sortants sans texte",
    severity: "low",
    group: "link-empty-anchor",
  },
  // ===== Overview =====
  {
    id: "issues_overview",
    filename_patterns: ["rapport_apercu_problemes.csv", "rapport_apercu_problemes_.csv"],
    short_label: "Aperçu problèmes",
    severity: "info",
    group: "overview",
  },
];

function normalizeFilename(name: string): string {
  // Strip path prefix, lowercase, remove diacritics + smart apostrophes.
  const base = name.split("/").pop() || name;
  return base
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‚‛ʼ]/g, "'")
    .trim();
}

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

// Order matters. Screaming Frog FR uses two distinct CSV shapes in the
// Issues ZIP:
//   • Page-centric (most files): the issue is ABOUT the page itself
//     → primary column = "Adresse". Examples: h1_manquant.csv,
//       title_des_pages_doublon.csv, codes_de_reponse_internes_*.csv
//   • Link-centric (a handful, all image- and inlinks-related): the
//     issue is ABOUT the target of a link, listed one row per
//     (source page × target). The columns are Source / Destination
//     instead of Adresse. Example: images_attributs_de_taille_manquants.csv
//       (1 040 rows, all pointing to ONE unique image : the footer logo
//        present on every page).
// We try "Adresse" first because it's the page identity when present.
// We then try Destination, which is the right URL for link-centric
// files. Source is last because it's only meaningful when nothing else
// works (and matching it as a top choice would dedupe by page on
// image-link reports and inflate the count, which is the bug we just
// caught).
const URL_KEYS = [
  "adresse", "address", "url", "uri", "page", "page url",
  "destination", "url de destination",
  "source", "url source", "page source",
];

function pickUrl(rec: Record<string, string>): string | null {
  for (const k of URL_KEYS) {
    const v = rec[normalizeKey(k)];
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  // Sometimes the URL is in an unknown column : fall back to the first string
  // that looks like a URL.
  for (const v of Object.values(rec)) {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

function parseCsvText(text: string): IssueLine[] {
  let cleaned = text.replace(/^﻿/, "");
  // Strip SF's leading banner if present (1-2 metadata rows before header).
  const lines = cleaned.split(/\r?\n/);
  let banner = 0;
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const probe = normalizeKey(lines[i]);
    if (URL_KEYS.some((k) => probe.includes(k))) { banner = i; break; }
  }
  if (banner > 0) cleaned = lines.slice(banner).join("\n");

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: normalizeKey,
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const out: IssueLine[] = [];
  for (const rec of result.data as Record<string, string>[]) {
    const url = pickUrl(rec);
    if (!url) continue;
    out.push({ url, extras: rec });
  }
  return out;
}

// Match a normalized filename against one of our patterns.
// Screaming Frog frequently appends a response-code suffix to issue
// filenames : e.g. "codes_de_reponse_internes_erreur_du_client_(4xx).csv"
// or "codes_de_reponse_internes_redirection_(3xx).csv". The previous strict
// equality check missed every one of those, which is why "Liens rompus"
// was always reporting 0 even on sites with hundreds of broken links.
//
// New rule: the file matches if its name equals the pattern OR starts with
// the same stem (pattern minus ".csv") followed by a separator (typically
// "_" or " ") and still ends with ".csv".
function matchesPattern(normName: string, pattern: string): boolean {
  if (normName === pattern) return true;
  if (normName.endsWith("/" + pattern)) return true;
  const stem = pattern.replace(/\.csv$/, "");
  // Tolerate "<stem>_(3xx).csv", "<stem> (3xx).csv", "<stem>-3xx.csv", etc.
  const re = new RegExp("(^|/)" + escapeReg(stem) + "[ _\\-(].*\\.csv$");
  return re.test(normName);
}
function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type IssuesParseResult = {
  parsed: ParsedIssue[];
  matched_files: string[];
  unknown_files: string[];
  total_csv_files: number;
  filename: string | null;
};

export async function parseIssuesZip(file: File): Promise<IssuesParseResult> {
  const JSZip = (await import("jszip")).default;
  // Force UTF-8 decoding of filenames. ZIPs produced by older
  // Screaming Frog builds on Windows use CP-437 / IBM-850 for
  // accented filenames, which makes 'codes_de_réponse...' look like
  // 'codes_de_r#U00e9ponse...' downstream. The `decodeFileName`
  // option tells JSZip to treat the raw filename bytes as UTF-8.
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), {
    decodeFileName: (bytes: string[] | Uint8Array | Buffer) => {
      if (bytes instanceof Uint8Array) {
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      }
      // Fallback for the typing — should never hit in browser.
      return String(bytes);
    },
  });

  const matched: ParsedIssue[] = [];
  const matchedNames: string[] = [];
  const unknownNames: string[] = [];
  let totalCsv = 0;

  const entries = Object.entries(zip.files).filter(
    ([, entry]) => !entry.dir && entry.name.toLowerCase().endsWith(".csv"),
  );
  totalCsv = entries.length;

  for (const [name, entry] of entries) {
    const normName = normalizeFilename(name);
    const def = ISSUE_MAP.find((d) => d.filename_patterns.some((p) => matchesPattern(normName, p)));
    if (!def) {
      unknownNames.push(name);
      continue;
    }
    const text = await entry.async("string");
    const rows = parseCsvText(text);
    matched.push({
      id: def.id,
      filename: name,
      short_label: def.short_label,
      severity: def.severity,
      group: def.group,
      rows,
    });
    matchedNames.push(name);
  }

  return {
    parsed: matched,
    matched_files: matchedNames,
    unknown_files: unknownNames,
    total_csv_files: totalCsv,
    filename: file.name,
  };
}

// Helper for the analyzer: pick a specific issue by id (returns empty if not
// in the ZIP : most issue files are only emitted when there are actual hits).
export function findIssue(issues: ParsedIssue[], id: string): ParsedIssue | null {
  return issues.find((i) => i.id === id) || null;
}

export function countIssue(issues: ParsedIssue[], id: string): number {
  return findIssue(issues, id)?.rows.length || 0;
}
