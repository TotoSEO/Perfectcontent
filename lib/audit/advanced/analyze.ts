// Build the full advanced audit report from:
//  1. The parsed interne_html.csv rows
//  2. The parsed Issues ZIP (FR Bulk Export > Issues > All)
//  3. Optional anchor analysis from all_inlinks.csv
//  4. Optional site-level resources fetched server-side (robots.txt / sitemap.xml / llms.txt)
//
// The output is a slide-ready Report : one ordered list of slides + a list
// of subcategories that drive the XLSX export.

import { VBT } from "../brand";
import type { Severity } from "../types";
import type { InternalRow } from "./parse-internal";
import { findIssue, type ParsedIssue } from "./parse-issues";
import { DESC, DESC_EXT, SECTION_COVER } from "./descriptions";
import { recosForSection } from "./recommendations";
import type {
  AdvKPI,
  AdvSlide,
  AdvSection,
  AdvSubcategory,
  AdvReport,
  AdvIssueRow,
  AnchorDestinationSummary,
  PriorityItem,
} from "./types";
import {
  pickWorstDestinations,
  pickTopConcentratedDestinations,
  type AnchorsParseResult,
} from "./parse-anchors";
import type { ImagesAllParseResult } from "./parse-images-all";

const COLORS = {
  ok: VBT.good,
  warn: VBT.amber500,
  bad: VBT.brick500,
  info: VBT.terracotta500,
  muted: VBT.paperEdge,
};

// ---------- helpers --------------------------------------------------------

const isHtml = (r: InternalRow) => r.content_type !== null && /text\/html/i.test(r.content_type);
const isIndexable = (r: InternalRow) => /^indexable$/i.test((r.indexability || "").trim());

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreFromRatio(badRatio: number): number {
  return Math.round(clamp(100 * (1 - clamp(badRatio, 0, 1))));
}

// Strict scoring used by the maillage subcategories. The previous
// scoreFromRatio decayed too slowly (a 28% orphan ratio still scored
// ~72/100). With this variant, score 100 at 0% bad, 50 at `badAt`,
// 0 at `4*badAt`. Tighter penalty on what should be a small ratio.
function scoreStrict(badRatio: number, badAt = 0.05): number {
  const r = Math.max(0, Math.min(1, badRatio / (badAt * 4)));
  return Math.round(100 * (1 - r));
}

// Extract a normalised image format from a URL. Used by the format
// distribution slide. Falls back to "autre" for unknown or missing
// extensions, normalises "jpg" → "jpeg" so the chart doesn't split them.
function extractFormat(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "jpg") return "jpeg";
  if (!ext || ext.length > 5) return "autre";
  return ext;
}

function toRow(url: string, severity: Severity, extras: Record<string, string | number | undefined> = {}): AdvIssueRow {
  const out: AdvIssueRow = { url, severity };
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function issueAsRows(issue: ParsedIssue | null, severity: Severity, extractor?: (line: { url: string; extras: Record<string, string> }) => Record<string, string | number>): AdvIssueRow[] {
  if (!issue) return [];
  return issue.rows.map((line) => {
    const extras = extractor ? extractor(line) : {};
    return toRow(line.url, severity, extras);
  });
}

// Build the row set for the diversity scatter plot (4.9). The N worst
// destinations come first (so the slide's "Top 3 à corriger" widget reads
// the right ones from rows[0..2]), then a broader sample of the rest of
// the destinations so the plot itself shows a real distribution.
function sampleForScatter(
  byDest: Map<string, AnchorDestinationSummary>,
  worst: AnchorDestinationSummary[],
  cap = 120,
): AnchorDestinationSummary[] {
  const seen = new Set(worst.map((w) => w.destination));
  const others = [...byDest.values()].filter(
    (d) => !seen.has(d.destination) && d.inlinks_count >= 2,
  );
  // Even-stride sample so we don't bias toward the most-linked pages.
  const remaining = Math.max(0, cap - worst.length);
  if (others.length <= remaining) return [...worst, ...others];
  const step = others.length / remaining;
  const picked: AnchorDestinationSummary[] = [];
  for (let i = 0; i < remaining; i++) {
    picked.push(others[Math.floor(i * step)]);
  }
  return [...worst, ...picked];
}

// ---------- Site resources (robots / sitemap / llms) -----------------------

export type SiteResources = NonNullable<AdvReport["site_resources"]>;

// Build the robots.txt subcategory slide content from the fetched payload.
function buildRobotsSitemap(
  res: SiteResources | null,
  internalIssues: ParsedIssue[],
): {
  sub: AdvSubcategory;
  slide: AdvSlide;
} {
  const blockedByRobots = findIssue(internalIssues, "http_internal_blocked_robots");
  const blockedCount = blockedByRobots?.rows.length || 0;

  // Distinguish three states:
  //   • not-fetched : the upstream call to /srv/audits/site-resources
  //     never returned (network failure, WAF block, timeout, etc.). On
  //     this branch we can't claim the robots.txt is "missing" : we
  //     simply didn't get the chance to look. Show an explicit warning.
  //   • fetched but missing : the call returned and the file isn't there.
  //   • fetched and present : analysed normally.
  const notFetched = res === null;
  const robotsExists = res?.robots_txt.fetched === true;
  const sitemapExists = res?.sitemap_xml.fetched === true;
  const sitemapRef = res?.robots_txt.has_sitemap_ref === true;
  const sitemapDuplicates = res?.sitemap_xml.duplicates || 0;
  const sitemapUrls = res?.sitemap_xml.url_count ?? null;

  // Build KPI values that reflect the three states. We use "Non analysé"
  // instead of "Absent" when the fetch failed so the consultant doesn't
  // mistakenly report to the client that the file is missing.
  const robotsValue = notFetched ? "Non analysé" : robotsExists ? "Présent" : "Absent";
  const sitemapValue = notFetched ? "Non analysé" : sitemapExists ? "Présent" : "Absent";
  const sitemapRefValue = notFetched ? "Non analysé" : sitemapRef ? "Oui" : "Non";

  const kpis: AdvKPI[] = [
    { label: "robots.txt", value: robotsValue, tone: notFetched ? "warn" : robotsExists ? "ok" : "bad" },
    { label: "sitemap.xml", value: sitemapValue, tone: notFetched ? "warn" : sitemapExists ? "ok" : "bad" },
    { label: "Sitemap dans robots", value: sitemapRefValue, tone: notFetched ? "warn" : sitemapRef ? "ok" : "warn" },
    { label: "URLs dans sitemap", value: sitemapUrls != null ? sitemapUrls.toLocaleString("fr-FR") : ", ", tone: "info" },
    { label: "Doublons sitemap", value: sitemapDuplicates, tone: sitemapDuplicates > 0 ? "warn" : "ok" },
    { label: "Pages bloquées robots.txt", value: blockedCount, tone: blockedCount > 0 ? "warn" : "ok" },
  ];

  const issues: AdvIssueRow[] = [];
  if (!notFetched) {
    // Only emit "create the file" issues when we actually attempted the
    // fetch. If the analysis didn't run, we can't claim the file is
    // missing.
    if (!robotsExists) issues.push(toRow("/robots.txt", "high", { reason: "Fichier absent ou non-200, à créer à la racine" }));
    if (!sitemapExists) issues.push(toRow("/sitemap.xml", "high", { reason: "Sitemap absent ou non-200" }));
    if (robotsExists && !sitemapRef) issues.push(toRow("/robots.txt", "medium", { reason: "Sitemap non référencé via `Sitemap:` dans le robots.txt" }));
    if (sitemapDuplicates > 0) issues.push(toRow("/sitemap.xml", "medium", { reason: `${sitemapDuplicates} URLs dupliquées dans le sitemap` }));
  }
  issues.push(...issueAsRows(blockedByRobots, "medium", () => ({ reason: "Bloquée par robots.txt" })));

  const sub: AdvSubcategory = {
    id: "robots_sitemap",
    label: "Robots.txt & sitemap",
    // Don't penalise the score when the analysis didn't run : fixed 50
    // (neutral) instead of "everything is broken".
    score: notFetched ? 50 : scoreFromRatio((!robotsExists ? 0.4 : 0) + (!sitemapExists ? 0.3 : 0) + (!sitemapRef && robotsExists ? 0.15 : 0) + (sitemapDuplicates > 0 ? 0.1 : 0)),
    issues_full: issues,
    columns: [{ key: "url", label: "URL", width: 60 }, { key: "reason", label: "Problème", width: 60 }],
    xlsx_sheet: "Robots & Sitemap",
  };

  const slide: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "robots_sitemap",
    title: "Robots.txt & sitemap",
    description: DESC.robots_sitemap + (notFetched
      ? "\n\n⚠️ L'analyse automatique du robots.txt et du sitemap.xml n'a pas pu s'effectuer (réseau, WAF, ou domaine non détecté à l'import). Vérifiez manuellement la présence de ces fichiers à la racine du site."
      : ""),
    kpis,
    xlsx_sheet: issues.length > 0 ? sub.xlsx_sheet : undefined,
    issues_count: issues.length,
    takeaway: notFetched
      ? "Analyse non disponible. Relancez l'import en vérifiant la connectivité au domaine."
      : !robotsExists || !sitemapExists
        ? "Fichier(s) critique(s) manquant(s) à créer en priorité."
        : (!sitemapRef ? "Référencer le sitemap dans le robots.txt : gain immédiat de découvrabilité." : "Fichiers en place."),
  };

  return { sub, slide };
}

// ---------- Indexability & crawl section -----------------------------------

function buildIndexabilityCrawl(
  rows: InternalRow[],
  issues: ParsedIssue[],
  res: SiteResources | null,
): { section: AdvSection; slides: AdvSlide[] } {
  const html = rows.filter(isHtml);
  const total = html.length || 1;

  // Section cover
  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "indexability_crawl",
    title: SECTION_COVER.indexability_crawl.title,
    eyebrow: "Partie 1 / 6",
    icon: SECTION_COVER.indexability_crawl.icon,
    bullets: SECTION_COVER.indexability_crawl.bullets,
  };

  // ----- Robots & sitemap (uses res)
  const { sub: subRobots, slide: slideRobots } = buildRobotsSitemap(res, issues);

  // ----- Depth
  const depthBins: Record<number, number> = {};
  let maxDepth = 0;
  let tooDeep = 0;
  const depthIssues: AdvIssueRow[] = [];
  for (const r of html.filter(isIndexable)) {
    const d = r.crawl_depth ?? -1;
    depthBins[d] = (depthBins[d] ?? 0) + 1;
    if (d > maxDepth) maxDepth = d;
    if (d >= 5) {
      tooDeep++;
      depthIssues.push(toRow(r.url, d >= 7 ? "high" : "medium", { depth: d, inlinks: r.inlinks ?? 0 }));
    }
  }
  const histogramKeys = Array.from({ length: Math.min(maxDepth + 1, 12) }, (_, i) => i);
  const subDepth: AdvSubcategory = {
    id: "depth",
    label: "Profondeur",
    score: scoreFromRatio(tooDeep / total),
    issues_full: depthIssues,
    columns: [
      { key: "depth", label: "Profondeur", width: 14 },
      { key: "inlinks", label: "Liens entrants", width: 16 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Profondeur",
  };
  const slideDepth: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "depth",
    title: "Profondeur des pages",
    description: DESC.depth,
    kpis: [
      { label: "Profondeur max", value: maxDepth, tone: maxDepth > 5 ? "bad" : "ok" },
      { label: "Pages > prof. 4", value: tooDeep, tone: tooDeep > 0 ? "warn" : "ok" },
      { label: "Pages prof. 0-3", value: histogramKeys.slice(0, 4).reduce((s, k) => s + (depthBins[k] ?? 0), 0), tone: "ok" },
      { label: "Pages prof. 5+", value: tooDeep, tone: tooDeep > 0 ? "bad" : "ok" },
    ],
    chart: {
      type: "histogram",
      bins: histogramKeys.map((k) => ({ label: `D${k}`, value: depthBins[k] ?? 0 })),
    },
    xlsx_sheet: depthIssues.length > 0 ? subDepth.xlsx_sheet : undefined,
    issues_count: depthIssues.length,
  };

  // ----- HTTP codes
  let s2 = 0, s3 = 0, s4 = 0, s5 = 0;
  for (const r of rows) {
    const c = r.status_code;
    if (c === null) continue;
    if (c >= 200 && c < 300) s2++;
    else if (c >= 300 && c < 400) s3++;
    else if (c >= 400 && c < 500) s4++;
    else if (c >= 500) s5++;
  }
  const httpInternal3xx = findIssue(issues, "http_internal_redirection");
  const httpInternal4xx = findIssue(issues, "http_internal_client_error");
  const httpExternal4xx = findIssue(issues, "http_external_client_error");
  const httpExternal5xx = findIssue(issues, "http_external_server_error");

  const httpIssues: AdvIssueRow[] = [
    ...issueAsRows(httpInternal3xx, "medium", (l) => ({ code: l.extras["code http"] || l.extras["status code"] || "3xx", type: "Interne", redirect: l.extras["url de redirection"] || l.extras["redirect url"] || "" })),
    ...issueAsRows(httpInternal4xx, "critical", (l) => ({ code: l.extras["code http"] || l.extras["status code"] || "4xx", type: "Interne" })),
    ...issueAsRows(httpExternal4xx, "high", (l) => ({ code: l.extras["code http"] || l.extras["status code"] || "4xx", type: "Externe" })),
    ...issueAsRows(httpExternal5xx, "critical", (l) => ({ code: l.extras["code http"] || l.extras["status code"] || "5xx", type: "Externe" })),
  ];
  const subHttp: AdvSubcategory = {
    id: "http_codes",
    label: "Codes HTTP",
    score: scoreFromRatio((s4 + s5 + (httpExternal4xx?.rows.length || 0) * 0.5) / Math.max(rows.length, 1)),
    issues_full: httpIssues,
    columns: [
      { key: "code", label: "Code", width: 10 },
      { key: "type", label: "Origine", width: 12 },
      { key: "redirect", label: "Cible (3xx)", width: 50 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Codes HTTP",
  };
  const slideHttp: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "http_codes",
    title: "Détails codes HTTP",
    description: DESC.http_codes,
    kpis: [
      { label: "200", value: s2, tone: "ok" },
      { label: "3xx", value: s3, tone: s3 > 0 ? "warn" : "ok" },
      { label: "4xx", value: s4, tone: s4 > 0 ? "bad" : "ok" },
      { label: "5xx", value: s5, tone: s5 > 0 ? "bad" : "ok" },
    ],
    chart: {
      type: "donut",
      segments: [
        { label: "200", value: s2, color: COLORS.ok },
        { label: "3xx", value: s3, color: COLORS.warn },
        { label: "4xx", value: s4, color: COLORS.bad },
        { label: "5xx", value: s5, color: COLORS.bad },
      ].filter((s) => s.value > 0),
    },
    xlsx_sheet: httpIssues.length > 0 ? subHttp.xlsx_sheet : undefined,
    issues_count: httpIssues.length,
  };

  // ----- Hreflang errors
  const hrefXdefault = findIssue(issues, "hreflang_xdefault_missing");
  const hrefNoindex = findIssue(issues, "hreflang_noindex_return");
  const hrefNon200 = findIssue(issues, "hreflang_non200");
  const hreflangIssues: AdvIssueRow[] = [
    ...issueAsRows(hrefXdefault, "medium", () => ({ error: "x-default manquant" })),
    ...issueAsRows(hrefNoindex, "high", () => ({ error: "Lien retour vers noindex" })),
    ...issueAsRows(hrefNon200, "high", () => ({ error: "URL hreflang non-200" })),
  ];
  const subHreflang: AdvSubcategory = {
    id: "hreflang",
    label: "Hreflang",
    score: scoreFromRatio(hreflangIssues.length / Math.max(html.length, 1)),
    issues_full: hreflangIssues,
    columns: [
      { key: "error", label: "Type d'erreur", width: 30 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Hreflang",
  };
  const slideHreflang: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "hreflang",
    title: "Erreurs hreflang",
    description: DESC.hreflang,
    kpis: [
      { label: "x-default manquant", value: hrefXdefault?.rows.length || 0, tone: (hrefXdefault?.rows.length || 0) > 0 ? "warn" : "ok" },
      { label: "Retour vers noindex", value: hrefNoindex?.rows.length || 0, tone: (hrefNoindex?.rows.length || 0) > 0 ? "bad" : "ok" },
      { label: "URL non-200", value: hrefNon200?.rows.length || 0, tone: (hrefNon200?.rows.length || 0) > 0 ? "bad" : "ok" },
      { label: "Total erreurs", value: hreflangIssues.length, tone: hreflangIssues.length > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: hreflangIssues.length > 0 ? subHreflang.xlsx_sheet : undefined,
    issues_count: hreflangIssues.length,
  };

  // ----- URLs without canonical (computed from interne_html.csv)
  // Perimeter = ALL HTML pages (hors pagination), not just indexable.
  // A page without a canonical tag is a problem regardless of its
  // indexability — Google may pick a different URL as canonical, and
  // a noindex page without canonical can still appear in the index
  // if Google chooses to ignore the noindex.
  let missingCanon = 0, selfCanon = 0, crossCanon = 0;
  const noCanonRows: AdvIssueRow[] = [];
  for (const r of html) {
    const c = (r.canonical || "").trim();
    if (!c) {
      missingCanon++;
      noCanonRows.push(toRow(r.url, "medium", { reason: "Pas de balise canonical" }));
    } else if (c === r.url) selfCanon++;
    else crossCanon++;
  }
  // Add SF "canonicalised" issues (pages canonicalisées vers une autre URL)
  const canonicalisedIssue = findIssue(issues, "canonical_canonicalised");
  if (canonicalisedIssue) {
    for (const line of canonicalisedIssue.rows) {
      noCanonRows.push(toRow(line.url, "low", { reason: "Page canonisée vers une autre URL" }));
    }
  }
  const subCanonical: AdvSubcategory = {
    id: "canonical",
    label: "Canonicals",
    score: scoreFromRatio(missingCanon / Math.max(html.length, 1)),
    issues_full: noCanonRows,
    columns: [
      { key: "reason", label: "Problème", width: 35 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Canonicals",
  };
  const slideCanonical: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "canonical",
    title: "URLs sans canonical",
    description: DESC.canonical,
    kpis: [
      { label: "Self-canonical", value: selfCanon, tone: "ok" },
      { label: "Cross-canonical", value: crossCanon, tone: crossCanon > 0 ? "info" : "ok" },
      { label: "Sans canonical", value: missingCanon, tone: missingCanon > 0 ? "bad" : "ok" },
      { label: "Canonisées (issues)", value: canonicalisedIssue?.rows.length || 0, tone: (canonicalisedIssue?.rows.length || 0) > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "donut",
      segments: [
        { label: "Self", value: selfCanon, color: COLORS.ok },
        { label: "Cross", value: crossCanon, color: COLORS.info },
        { label: "Aucune", value: missingCanon, color: COLORS.bad },
      ].filter((s) => s.value > 0),
    },
    xlsx_sheet: noCanonRows.length > 0 ? subCanonical.xlsx_sheet : undefined,
    issues_count: noCanonRows.length,
  };

  // ----- Pages en noindex (from directives_noindex.csv)
  // Important : on NE PÉNALISE PAS le score pour les pages noindex —
  // c'est souvent volontaire (panier, compte client, page de remerciement,
  // filtres facettes). Score figé à 100, sévérité "info". Seule la liste
  // dans le XLSX a un sens, pour que le consultant repasse dessus et
  // confirme manuellement quelles sont volontaires vs accidentelles.
  const noindexIssue = findIssue(issues, "directive_noindex");
  const noindexRows = issueAsRows(noindexIssue, "info", (l) => ({
    indexability_status: l.extras["statut d indexabilite"] || l.extras["statut d'indexabilite"] || "noindex",
    inlinks: l.extras["liens entrants"] || l.extras.inlinks || "",
  }));
  const subNoindex: AdvSubcategory = {
    id: "noindex_pages",
    label: "Pages en noindex",
    score: 100, // décorrélé : voir commentaire ci-dessus
    issues_full: noindexRows,
    columns: [
      { key: "indexability_status", label: "Raison", width: 35 },
      { key: "inlinks", label: "Liens entrants", width: 16 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Pages noindex",
  };
  const slideNoindex: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "noindex_pages",
    title: "Pages en noindex",
    description: "Les pages en noindex ne sont pas indexées par Google. C'est très fréquemment volontaire et parfaitement sain : panier, compte client, page de remerciement après formulaire, page de désabonnement, filtres facettes, résultats de recherche interne. Cette slide n'est PAS une liste d'erreurs : c'est une liste à parcourir pour confirmer que chaque page est bien noindex intentionnellement. Une page seulement devient un problème si elle reçoit des liens internes alors qu'elle ne devrait pas être noindex.",
    kpis: [
      { label: "URLs en noindex", value: noindexRows.length, tone: "info" },
      { label: "% du site", value: html.length > 0 ? `${Math.round((noindexRows.length / html.length) * 100)} %` : "0 %", tone: "info" },
    ],
    xlsx_sheet: noindexRows.length > 0 ? subNoindex.xlsx_sheet : undefined,
    // issues_count est mis à 0 pour que le badge "X problèmes" en haut de
    // la slide ne s'affiche pas : ce n'est pas un compteur d'erreurs.
    issues_count: 0,
    takeaway: noindexRows.length === 0
      ? "Aucune page noindex détectée."
      : `${noindexRows.length} page(s) noindex à passer en revue manuellement pour confirmer qu'elles sont volontairement exclues.`,
  };

  // (LLMS.txt slide moved to the GEO section : buildGeo() creates it now,
  //  which is where it belongs thematically.)

  // ----- Recommendations slide
  const slideReco: AdvSlide = {
    kind: "reco",
    section_id: "indexability_crawl",
    title: "Recommandations : Indexabilité & crawl",
    groups: recosForSection("indexability_crawl"),
  };

  const subcategories = [subRobots, subDepth, subHttp, subHreflang, subCanonical, subNoindex];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "indexability_crawl",
    label: "Indexabilité & crawl",
    score: sectionScore,
    weight: 20,
    summary: `${tooDeep} pages > prof. 4 · ${s4 + s5} URLs en erreur · ${missingCanon} sans canonical · ${noindexRows.length} noindex`,
    subcategories,
  };

  return {
    section,
    // llms.txt was moved to the new GEO section : it sat awkwardly in
    // "Indexabilité & crawl" because it's specifically an LLM signal, not a
    // search-engine indexation lever.
    slides: [cover, slideRobots, slideDepth, slideHttp, slideHreflang, slideCanonical, slideNoindex, slideReco],
  };
}

// ---------- Performance section --------------------------------------------

function buildPerformance(rows: InternalRow[]): { section: AdvSection; slides: AdvSlide[] } {
  const html = rows.filter(isHtml);
  const total = html.length || 1;

  // Response time
  let fast = 0, medium = 0, slow = 0, verySlow = 0;
  const slowRows: AdvIssueRow[] = [];
  for (const r of html) {
    const t = r.response_time;
    if (t === null) continue;
    if (t < 0.5) fast++;
    else if (t < 1.0) medium++;
    else if (t < 2.0) {
      slow++;
      slowRows.push(toRow(r.url, "medium", { response_time_s: Math.round(t * 1000) / 1000 }));
    } else {
      verySlow++;
      slowRows.push(toRow(r.url, "high", { response_time_s: Math.round(t * 1000) / 1000 }));
    }
  }
  const subResp: AdvSubcategory = {
    id: "response_time",
    label: "Temps de réponse",
    score: scoreFromRatio((verySlow * 1 + slow * 0.5) / total),
    issues_full: slowRows,
    columns: [
      { key: "response_time_s", label: "TTFB (s)", width: 14 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Temps de chargement",
  };
  const slideResp: AdvSlide = {
    kind: "data",
    section_id: "performance",
    sub_id: "response_time",
    title: "Temps de chargement",
    description: DESC.response_time,
    kpis: [
      { label: "< 500 ms", value: fast, tone: "ok" },
      { label: "500 ms – 1 s", value: medium, tone: medium > 0 ? "info" : "ok" },
      { label: "1 – 2 s", value: slow, tone: slow > 0 ? "warn" : "ok" },
      { label: "> 2 s", value: verySlow, tone: verySlow > 0 ? "bad" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "< 500 ms", value: fast, color: COLORS.ok },
        { label: "500 ms – 1 s", value: medium, color: COLORS.info },
        { label: "1 – 2 s", value: slow, color: COLORS.warn },
        { label: "> 2 s", value: verySlow, color: COLORS.bad },
      ],
    },
    xlsx_sheet: slowRows.length > 0 ? subResp.xlsx_sheet : undefined,
    issues_count: slowRows.length,
  };

  // HTML weight
  let under500 = 0, under1m = 0, under2m = 0, over2m = 0;
  const heavyHtml: AdvIssueRow[] = [];
  for (const r of html) {
    const s = r.size_bytes;
    if (s === null) continue;
    const kb = s / 1024;
    if (kb < 500) under500++;
    else if (kb < 1024) under1m++;
    else if (kb < 2048) {
      under2m++;
      heavyHtml.push(toRow(r.url, "medium", { html_size_kb: Math.round(kb) }));
    } else {
      over2m++;
      heavyHtml.push(toRow(r.url, "critical", { html_size_kb: Math.round(kb), warning: "Au-delà de la limite Googlebot 2 Mo : risque de troncature" }));
    }
  }
  const subWeight: AdvSubcategory = {
    id: "html_weight",
    label: "Poids HTML",
    score: scoreFromRatio(over2m / total),
    issues_full: heavyHtml,
    columns: [
      { key: "html_size_kb", label: "Poids (Ko)", width: 14 },
      { key: "warning", label: "Note", width: 50 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Poids HTML",
  };
  const slideWeight: AdvSlide = {
    kind: "data",
    section_id: "performance",
    sub_id: "html_weight",
    title: "Poids des pages HTML",
    description: DESC.html_weight,
    kpis: [
      { label: "< 500 Ko", value: under500, tone: "ok" },
      { label: "500 Ko – 1 Mo", value: under1m, tone: "info" },
      { label: "1 – 2 Mo", value: under2m, tone: under2m > 0 ? "warn" : "ok" },
      { label: "> 2 Mo (⚠ Googlebot)", value: over2m, tone: over2m > 0 ? "bad" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "< 500 Ko", value: under500, color: COLORS.ok },
        { label: "500 Ko – 1 Mo", value: under1m, color: COLORS.info },
        { label: "1 – 2 Mo", value: under2m, color: COLORS.warn },
        { label: "> 2 Mo", value: over2m, color: COLORS.bad },
      ],
    },
    xlsx_sheet: heavyHtml.length > 0 ? subWeight.xlsx_sheet : undefined,
    issues_count: heavyHtml.length,
    takeaway: over2m > 0
      ? `${over2m} page(s) > 2 Mo : Googlebot risque de tronquer le contenu : à traiter en priorité.`
      : "Aucune page ne dépasse la limite Googlebot ✓",
  };

  // Section cover & reco
  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "performance",
    title: SECTION_COVER.performance.title,
    eyebrow: "Partie 2 / 6",
    icon: SECTION_COVER.performance.icon,
    bullets: SECTION_COVER.performance.bullets,
  };
  const reco: AdvSlide = {
    kind: "reco",
    section_id: "performance",
    title: "Recommandations : Performance",
    groups: recosForSection("performance"),
  };

  const subcategories = [subResp, subWeight];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "performance",
    label: "Performance",
    score: sectionScore,
    weight: 15,
    summary: `${slow + verySlow} pages > 1 s TTFB · ${over2m} pages > 2 Mo HTML`,
    subcategories,
  };
  return { section, slides: [cover, slideResp, slideWeight, reco] };
}

// ---------- Meta section ---------------------------------------------------

function buildMeta(rows: InternalRow[], issues: ParsedIssue[]): { section: AdvSection; slides: AdvSlide[] } {
  // Perimeter for title/meta/H1 checks = ALL HTML pages (not just
  // indexable). A title missing on a noindex page is still a title
  // missing — the client needs to see it to validate that the noindex
  // is intentional. Restricting to indexable previously hid real issues.
  const html = rows.filter(isHtml);
  // Indexable HTML — used for the *duplicate* counts (duplicates on
  // noindex pages are rarely actionable since the pages aren't in
  // search).
  const htmlIndexable = html.filter(isIndexable);

  // Compute basic counts on the spot (lengths, missing) — on the full HTML
  // perimeter, not just indexable.
  let titleMissing = 0, metaMissing = 0, h1Missing = 0;
  let titleShort = 0, titleLong = 0, metaShort = 0, metaLong = 0;
  for (const r of html) {
    const t = (r.title || "").trim();
    const m = (r.meta_description || "").trim();
    const h = (r.h1 || "").trim();
    if (!t) titleMissing++;
    else {
      const len = r.title_length ?? t.length;
      if (len < 30) titleShort++;
      else if (len > 60) titleLong++;
    }
    if (!m) metaMissing++;
    else {
      const len = r.meta_description_length ?? m.length;
      if (len < 70) metaShort++;
      else if (len > 155) metaLong++;
    }
    if (!h) h1Missing++;
  }

  const titleDup = findIssue(issues, "title_duplicate");
  const titleSameH1 = findIssue(issues, "title_same_as_h1");
  const metaDup = findIssue(issues, "meta_duplicate");
  const h1Dup = findIssue(issues, "h1_duplicate");
  const h1Long = findIssue(issues, "h1_long");

  // ----- Titles & meta description (combined first slide)
  const tmIssues: AdvIssueRow[] = [];
  for (const r of html) {
    if (!(r.title || "").trim()) tmIssues.push(toRow(r.url, "high", { type: "Title", reason: "Manquant", length: 0 }));
    if (!(r.meta_description || "").trim()) tmIssues.push(toRow(r.url, "medium", { type: "Meta", reason: "Manquante", length: 0 }));
  }
  for (const r of html) {
    const len = r.title_length ?? 0;
    if (len > 0 && len < 30) tmIssues.push(toRow(r.url, "low", { type: "Title", reason: `Trop court (${len}c)`, length: len }));
    if (len > 60) tmIssues.push(toRow(r.url, "low", { type: "Title", reason: `Trop long (${len}c)`, length: len }));
    const mlen = r.meta_description_length ?? 0;
    if (mlen > 0 && mlen < 70) tmIssues.push(toRow(r.url, "low", { type: "Meta", reason: `Trop courte (${mlen}c)`, length: mlen }));
    if (mlen > 155) tmIssues.push(toRow(r.url, "low", { type: "Meta", reason: `Trop longue (${mlen}c)`, length: mlen }));
  }
  if (titleSameH1) for (const line of titleSameH1.rows) tmIssues.push(toRow(line.url, "low", { type: "Title", reason: "Identique au H1" }));

  const subTitlesMeta: AdvSubcategory = {
    id: "titles_meta_basic",
    label: "Titles & meta",
    score: scoreFromRatio((titleMissing * 1 + metaMissing * 0.5 + (titleSameH1?.rows.length || 0) * 0.2) / Math.max(html.length, 1)),
    issues_full: tmIssues,
    columns: [
      { key: "type", label: "Type", width: 12 },
      { key: "reason", label: "Problème", width: 35 },
      { key: "length", label: "Long.", width: 10 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Titles & meta",
  };
  const slideTitlesMeta: AdvSlide = {
    kind: "data",
    section_id: "meta",
    sub_id: "titles_meta_basic",
    title: "Balises title & meta description",
    description: DESC.titles_meta,
    kpis: [
      { label: "Title manquant", value: titleMissing, tone: titleMissing > 0 ? "bad" : "ok" },
      { label: "Title hors gabarit", value: titleShort + titleLong, tone: titleShort + titleLong > 0 ? "warn" : "ok" },
      { label: "Meta manquante", value: metaMissing, tone: metaMissing > 0 ? "warn" : "ok" },
      { label: "Meta hors gabarit", value: metaShort + metaLong, tone: metaShort + metaLong > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: tmIssues.length > 0 ? subTitlesMeta.xlsx_sheet : undefined,
    issues_count: tmIssues.length,
  };

  // ----- Titles duplicate
  const titleDupRows = issueAsRows(titleDup, "high", (l) => ({ title: l.extras["title 1"] || l.extras.title || "", occurrences: l.extras["nombre d occurrences"] || "" }));
  const subTitleDup: AdvSubcategory = {
    id: "title_duplicate",
    label: "Titles en double",
    score: scoreFromRatio(titleDupRows.length / Math.max(html.length, 1)),
    issues_full: titleDupRows,
    columns: [
      { key: "title", label: "Title", width: 50 },
      { key: "occurrences", label: "Occ.", width: 10 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Titles dupliqués",
  };
  const slideTitleDup: AdvSlide = {
    kind: "data",
    section_id: "meta",
    sub_id: "title_duplicate",
    title: "Titles en double",
    description: DESC.titles_duplicate,
    kpis: [
      { label: "URLs concernées", value: titleDupRows.length, tone: titleDupRows.length > 0 ? "bad" : "ok" },
    ],
    xlsx_sheet: titleDupRows.length > 0 ? subTitleDup.xlsx_sheet : undefined,
    issues_count: titleDupRows.length,
  };

  // ----- Meta duplicate
  const metaDupRows = issueAsRows(metaDup, "high", (l) => ({ meta: l.extras["meta description 1"] || l.extras["meta description"] || "" }));
  const subMetaDup: AdvSubcategory = {
    id: "meta_duplicate",
    label: "Meta dupliquées",
    score: scoreFromRatio(metaDupRows.length / Math.max(html.length, 1)),
    issues_full: metaDupRows,
    columns: [
      { key: "meta", label: "Meta", width: 60 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Meta dupliquées",
  };
  const slideMetaDup: AdvSlide = {
    kind: "data",
    section_id: "meta",
    sub_id: "meta_duplicate",
    title: "Meta descriptions en double",
    description: DESC.meta_duplicate,
    kpis: [
      { label: "URLs concernées", value: metaDupRows.length, tone: metaDupRows.length > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: metaDupRows.length > 0 ? subMetaDup.xlsx_sheet : undefined,
    issues_count: metaDupRows.length,
  };

  // ----- H1 duplicate (long H1s live in the Structure section instead)
  const h1DupRows = issueAsRows(h1Dup, "medium", (l) => ({ h1: l.extras["h1-1"] || l.extras.h1 || "" }));
  const subH1Dup: AdvSubcategory = {
    id: "h1_duplicate",
    label: "H1 en double",
    score: scoreFromRatio(h1DupRows.length / Math.max(html.length, 1)),
    issues_full: h1DupRows,
    columns: [
      { key: "h1", label: "H1", width: 50 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "H1 dupliqués",
  };
  const slideH1Dup: AdvSlide = {
    kind: "data",
    section_id: "meta",
    sub_id: "h1_duplicate",
    title: "H1 en double",
    description: DESC.h1_duplicate,
    kpis: [
      { label: "URLs concernées", value: h1DupRows.length, tone: h1DupRows.length > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: h1DupRows.length > 0 ? subH1Dup.xlsx_sheet : undefined,
    issues_count: h1DupRows.length,
  };

  // Section cover & reco
  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "meta",
    title: SECTION_COVER.meta.title,
    eyebrow: "Partie 3 / 6",
    icon: SECTION_COVER.meta.icon,
    bullets: SECTION_COVER.meta.bullets,
  };
  const reco: AdvSlide = {
    kind: "reco",
    section_id: "meta",
    title: "Recommandations : Balises & métadonnées",
    groups: recosForSection("meta"),
  };

  const subcategories = [subTitlesMeta, subTitleDup, subMetaDup, subH1Dup];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "meta",
    label: "Balises & métadonnées",
    score: sectionScore,
    weight: 15,
    summary: `${titleMissing + metaMissing + h1Missing} balises manquantes · ${titleDupRows.length + metaDupRows.length + h1DupRows.length} doublons`,
    subcategories,
  };
  return {
    section,
    slides: [cover, slideTitlesMeta, slideTitleDup, slideMetaDup, slideH1Dup, reco],
  };
}

// ---------- Structure section ----------------------------------------------

function buildStructure(rows: InternalRow[], issues: ParsedIssue[]): { section: AdvSection; slides: AdvSlide[] } {
  const html = rows.filter(isHtml).filter(isIndexable);

  const h1Missing = findIssue(issues, "h1_missing");
  const h2Missing = findIssue(issues, "h2_missing");
  const h2Multiple = findIssue(issues, "h2_multiple");
  const h2NonSeq = findIssue(issues, "h2_non_sequential");
  const h2Duplicate = findIssue(issues, "h2_duplicate");
  const h1Long = findIssue(issues, "h1_long");
  const h2Long = findIssue(issues, "h2_long");

  const hnIssues: AdvIssueRow[] = [
    ...issueAsRows(h1Missing, "high", () => ({ type: "H1", problem: "Manquant" })),
    ...issueAsRows(h1Long, "low", () => ({ type: "H1", problem: "Plus de 70 caractères" })),
    ...issueAsRows(h2Missing, "medium", () => ({ type: "H2", problem: "Manquant" })),
    ...issueAsRows(h2Multiple, "low", () => ({ type: "H2", problem: "Plusieurs H2 identiques sur la page" })),
    ...issueAsRows(h2Duplicate, "low", () => ({ type: "H2", problem: "H2 dupliqué entre plusieurs pages" })),
    ...issueAsRows(h2Long, "low", () => ({ type: "H2", problem: "Plus de 70 caractères" })),
  ];
  const subHn: AdvSubcategory = {
    id: "hn_structure",
    label: "Structure Hn",
    score: scoreFromRatio((h1Missing?.rows.length || 0) / Math.max(html.length, 1)),
    issues_full: hnIssues,
    columns: [
      { key: "type", label: "Niveau", width: 12 },
      { key: "problem", label: "Problème", width: 40 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Structure Hn",
  };
  const slideHn: AdvSlide = {
    kind: "data",
    section_id: "structure",
    sub_id: "hn_structure",
    title: "Structures Hn en erreur",
    description: DESC.hn_structure,
    kpis: [
      { label: "H1 manquants", value: h1Missing?.rows.length || 0, tone: (h1Missing?.rows.length || 0) > 0 ? "bad" : "ok" },
      { label: "H2 manquants", value: h2Missing?.rows.length || 0, tone: (h2Missing?.rows.length || 0) > 0 ? "warn" : "ok" },
      { label: "H1 > 70 caractères", value: h1Long?.rows.length || 0, tone: (h1Long?.rows.length || 0) > 0 ? "info" : "ok" },
      { label: "H2 dupliqués", value: h2Duplicate?.rows.length || 0, tone: (h2Duplicate?.rows.length || 0) > 0 ? "info" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "H1 manquant", value: h1Missing?.rows.length || 0, color: COLORS.bad },
        { label: "H2 manquant", value: h2Missing?.rows.length || 0, color: COLORS.warn },
        { label: "H1 > 70c", value: h1Long?.rows.length || 0, color: COLORS.info },
        { label: "H2 dupl.", value: h2Duplicate?.rows.length || 0, color: COLORS.info },
        { label: "H2 multi.", value: h2Multiple?.rows.length || 0, color: COLORS.info },
      ],
    },
    xlsx_sheet: hnIssues.length > 0 ? subHn.xlsx_sheet : undefined,
    issues_count: hnIssues.length,
  };

  const hierIssues = issueAsRows(h2NonSeq, "medium", () => ({ problem: "Saut de hiérarchie (H1 → H3 par ex.)" }));
  const subHier: AdvSubcategory = {
    id: "hn_hierarchy",
    label: "Sauts de hiérarchie",
    score: scoreFromRatio(hierIssues.length / Math.max(html.length, 1)),
    issues_full: hierIssues,
    columns: [
      { key: "problem", label: "Problème", width: 50 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Sauts hiérarchie H2",
  };
  const slideHier: AdvSlide = {
    kind: "data",
    section_id: "structure",
    sub_id: "hn_hierarchy",
    title: "Sauts de hiérarchie H2",
    description: DESC.hn_hierarchy,
    kpis: [
      { label: "Pages concernées", value: hierIssues.length, tone: hierIssues.length > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: hierIssues.length > 0 ? subHier.xlsx_sheet : undefined,
    issues_count: hierIssues.length,
  };

  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "structure",
    title: SECTION_COVER.structure.title,
    eyebrow: "Partie 4 / 6",
    icon: SECTION_COVER.structure.icon,
    bullets: SECTION_COVER.structure.bullets,
  };
  const reco: AdvSlide = {
    kind: "reco",
    section_id: "structure",
    title: "Recommandations : Structure de contenu",
    groups: recosForSection("structure"),
  };

  const subcategories = [subHn, subHier];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "structure",
    label: "Structure de contenu",
    score: sectionScore,
    weight: 10,
    summary: `${h1Missing?.rows.length || 0} sans H1 · ${h2Missing?.rows.length || 0} sans H2 · ${hierIssues.length} sauts de hiérarchie`,
    subcategories,
  };
  return { section, slides: [cover, slideHn, slideHier, reco] };
}

// ---------- Linking section ------------------------------------------------

function buildLinking(
  rows: InternalRow[],
  issues: ParsedIssue[],
  anchors: AnchorsParseResult | null,
): { section: AdvSection; slides: AdvSlide[] } {
  const html = rows.filter(isHtml).filter(isIndexable);

  // Internal linking overview.
  // When the inlinks file (liens_entrants_tous.csv) is available, we use
  // it to count CONTEXTUAL inlinks only (it's already filtered to body
  // links : no nav, header, footer, menu). Otherwise we fall back to
  // interne_html.csv's raw inlinks column, which is the nav-polluted
  // version SF emits by default and is what was previously producing
  // "908 pages avec 10+ liens entrants" on sites with a fat footer.
  const contextualInlinks = anchors
    ? anchors.by_destination
    : null;
  const inlinksFor = (url: string): number => {
    if (contextualInlinks) {
      return contextualInlinks.get(url)?.inlinks_count ?? 0;
    }
    return 0;
  };

  let orphans = 0, low = 0, mid = 0, high = 0;
  const orphanRows: AdvIssueRow[] = [];
  for (const r of html) {
    // Use the anchors-derived count when available, fall back to internal_html.
    const i = contextualInlinks ? inlinksFor(r.url) : (r.inlinks ?? 0);
    if (i === 0) {
      orphans++;
      orphanRows.push(toRow(r.url, "high", { inlinks: 0, outlinks: r.outlinks ?? 0, problem: "Page orpheline (0 lien entrant contextuel)" }));
    } else if (i < 3) {
      low++;
      orphanRows.push(toRow(r.url, "medium", { inlinks: i, outlinks: r.outlinks ?? 0, problem: "Sous-maillée (< 3 liens entrants contextuels)" }));
    } else if (i < 10) mid++;
    else high++;
  }
  let noOutlinks = 0;
  for (const r of html) {
    if ((r.outlinks ?? 0) === 0) {
      noOutlinks++;
      orphanRows.push(toRow(r.url, "low", { inlinks: contextualInlinks ? inlinksFor(r.url) : (r.inlinks ?? 0), outlinks: 0, problem: "Cul-de-sac (0 lien sortant)" }));
    }
  }
  const orphanRatio = orphans / Math.max(html.length, 1);
  const underlinkedRatio = (orphans + low) / Math.max(html.length, 1);
  const subOverview: AdvSubcategory = {
    id: "internal_linking_overview",
    label: "Maillage : vue d'ensemble",
    // Strict scoring : at 1% orphans we already drop into "warning"
    // territory; at 5% orphans we hit zero. Same for the broader
    // "under-linked" pool (orphans + 1-2 inlinks).
    score: Math.min(
      scoreStrict(orphanRatio, 0.01),         // > 1% orphans = real problem
      scoreStrict(underlinkedRatio, 0.05),    // > 5% under-linked = real problem
    ),
    issues_full: [],
    columns: [],
    xlsx_sheet: "Maillage : vue",
  };
  const slideOverview: AdvSlide = {
    kind: "data",
    section_id: "linking",
    sub_id: "internal_linking_overview",
    title: "Maillage interne",
    description: DESC.internal_linking + (contextualInlinks
      ? "\n\nLes comptes ci-dessous excluent le menu, l'en-tête et le pied de page : seuls les liens internes contextuels (dans le contenu) sont pris en compte."
      : "\n\n⚠️ Sans le fichier liens_entrants_tous.csv, les comptes incluent les liens de navigation (menu/en-tête/pied de page) et surestiment le maillage réel."),
    kpis: [
      { label: "Orphelines (0 lien)", value: orphans, tone: orphans > 0 ? "bad" : "ok" },
      { label: "1-2 liens entrants", value: low, tone: low > 0 ? "warn" : "ok" },
      { label: "3-9 liens entrants", value: mid, tone: "ok" },
      { label: "10+ liens entrants", value: high, tone: "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "0 lien entrant", value: orphans, color: COLORS.bad },
        { label: "1-2 liens", value: low, color: COLORS.warn },
        { label: "3-9 liens", value: mid, color: COLORS.info },
        { label: "10+ liens", value: high, color: COLORS.ok },
      ],
    },
    issues_count: 0,
  };

  // Broken links : two complementary sources:
  // 1. The Bulk Issues ZIP (codes_de_reponse_* CSVs) which lists pages of
  //    the user's own site returning 4xx/5xx.
  // 2. The Inlinks export, which lists every <a href> with its destination
  //    status code : catches both internal broken targets AND external
  //    URLs that the site links to that have died. This is the more
  //    reliable source because SF emits the file consistently in the FR
  //    locale where the Issues ZIP filenames vary.
  const brokenInternal = findIssue(issues, "http_internal_client_error");
  const brokenExternal4xx = findIssue(issues, "http_external_client_error");
  const brokenExternal5xx = findIssue(issues, "http_external_server_error");

  const brokenIssues: AdvIssueRow[] = [
    ...issueAsRows(brokenInternal, "critical", (l) => ({ type: "Interne", code: l.extras["code http"] || l.extras["code de statut"] || l.extras["status code"] || "404", source: "" })),
    ...issueAsRows(brokenExternal4xx, "high", (l) => ({ type: "Externe", code: l.extras["code http"] || l.extras["code de statut"] || l.extras["status code"] || "404", source: "" })),
    ...issueAsRows(brokenExternal5xx, "critical", (l) => ({ type: "Externe", code: l.extras["code http"] || l.extras["code de statut"] || l.extras["status code"] || "5xx", source: "" })),
  ];

  // Augment with broken links picked out of the inlinks file. Dedupe by
  // destination URL so we don't double-count the same broken target when
  // both sources report it. We also dedupe the per-category counters
  // separately so the KPIs ('Internes 4xx', 'Externes 4xx', 'Total')
  // stay arithmetically consistent : the previous code counted raw
  // occurrences in the per-category KPIs while only the Total was
  // dedupped, which surfaced as 'Externes 4xx: 3, Total: 1' in tests.
  const seenDest = new Set(brokenIssues.map((r) => r.url));
  const uniqueInternalFromInlinks = new Set<string>();
  const uniqueExternal4xxFromInlinks = new Set<string>();
  const uniqueExternal5xxFromInlinks = new Set<string>();
  if (anchors?.broken_links?.length) {
    for (const bl of anchors.broken_links) {
      if (bl.origin === "internal") uniqueInternalFromInlinks.add(bl.destination);
      else if (bl.status >= 500) uniqueExternal5xxFromInlinks.add(bl.destination);
      else uniqueExternal4xxFromInlinks.add(bl.destination);
      if (seenDest.has(bl.destination)) continue;
      seenDest.add(bl.destination);
      const isInternal = bl.origin === "internal";
      const severity: Severity =
        bl.status >= 500 || isInternal ? "critical"
          : bl.status >= 400 ? "high" : "medium";
      brokenIssues.push({
        url: bl.destination,
        severity,
        type: isInternal ? "Interne" : "Externe",
        code: bl.status,
        source: bl.source,
        anchor: bl.anchor,
      });
    }
  }

  // Dedup ZIP-side rows too (some SF exports duplicate when a URL
  // matches multiple sub-issues), then merge with the anchor-derived
  // unique sets. End result: every KPI is a count of UNIQUE destination
  // URLs, never of occurrences.
  const internalTotal = new Set([
    ...((brokenInternal?.rows || []).map((r) => r.url)),
    ...uniqueInternalFromInlinks,
  ]).size;
  const external4xxTotal = new Set([
    ...((brokenExternal4xx?.rows || []).map((r) => r.url)),
    ...uniqueExternal4xxFromInlinks,
  ]).size;
  const external5xxTotal = new Set([
    ...((brokenExternal5xx?.rows || []).map((r) => r.url)),
    ...uniqueExternal5xxFromInlinks,
  ]).size;

  const subBroken: AdvSubcategory = {
    id: "broken_links",
    label: "Liens rompus",
    // Broken links should be ZERO. Strict scoring : even a small ratio
    // (1% of pages with broken links) drops the score significantly.
    score: scoreStrict(brokenIssues.length / Math.max(rows.length, 1), 0.005),
    issues_full: brokenIssues,
    columns: [
      { key: "type", label: "Origine", width: 12 },
      { key: "code", label: "Code", width: 10 },
      { key: "url", label: "URL cible", width: 60 },
      { key: "source", label: "Page source", width: 60 },
      { key: "anchor", label: "Ancre", width: 30 },
    ],
    xlsx_sheet: "Liens rompus",
  };
  const slideBroken: AdvSlide = {
    kind: "data",
    section_id: "linking",
    sub_id: "broken_links",
    title: "Liens internes / externes rompus",
    description: DESC.broken_links,
    kpis: [
      { label: "Internes 4xx/5xx", value: internalTotal, tone: internalTotal > 0 ? "bad" : "ok" },
      { label: "Externes 4xx", value: external4xxTotal, tone: external4xxTotal > 0 ? "warn" : "ok" },
      { label: "Externes 5xx", value: external5xxTotal, tone: external5xxTotal > 0 ? "bad" : "ok" },
      { label: "Total", value: brokenIssues.length, tone: brokenIssues.length > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: brokenIssues.length > 0 ? subBroken.xlsx_sheet : undefined,
    issues_count: brokenIssues.length,
  };

  // ----- Liens internes 301 (chaînes de redirection) -----
  // SF emits a per-redirect file in the Issues ZIP and the anchor file
  // carries every link's destination status. Both feed this slide; we
  // dedupe by (source, destination) to keep the volume actionable.
  const redirectIssue = findIssue(issues, "http_internal_redirection");
  const redirectsFromAnchors = anchors?.redirected_links || [];
  const redirRows: AdvIssueRow[] = [];
  const seenRedir = new Set<string>();
  for (const line of (redirectIssue?.rows || [])) {
    const key = line.url;
    if (seenRedir.has(key)) continue;
    seenRedir.add(key);
    redirRows.push(toRow(line.url, "medium", {
      code: line.extras["code http"] || line.extras["code de statut"] || "301",
      target: line.extras["url de redirection"] || line.extras["redirect url"] || "",
      source: "",
      anchor: "",
    }));
  }
  for (const rl of redirectsFromAnchors) {
    const key = `${rl.source}|${rl.destination}`;
    if (seenRedir.has(key)) continue;
    seenRedir.add(key);
    redirRows.push(toRow(rl.destination, rl.status === 302 ? "medium" : "low", {
      code: rl.status,
      target: "",
      source: rl.source,
      anchor: rl.anchor,
    }));
  }
  const subRedirects: AdvSubcategory = {
    id: "internal_redirects",
    label: "Liens internes 301",
    // Ratio = redirected internal links / total contextual links. Strict
    // at 10% : a healthy site has < 1-2% redirects in editorial links.
    score: scoreStrict(
      redirRows.length / Math.max(anchors?.total_editorial_links || rows.length, 1),
      0.10,
    ),
    issues_full: redirRows,
    columns: [
      { key: "code", label: "Code", width: 10 },
      { key: "source", label: "Page source", width: 60 },
      { key: "url", label: "URL redirigée", width: 60 },
      { key: "target", label: "Cible finale", width: 60 },
      { key: "anchor", label: "Ancre", width: 30 },
    ],
    xlsx_sheet: "Liens 301 internes",
  };
  const slideRedirects: AdvSlide = {
    kind: "data",
    section_id: "linking",
    sub_id: "internal_redirects",
    title: "Liens internes 301 (chaînes de redirection)",
    description: DESC_EXT.inlinks_301,
    kpis: [
      { label: "Liens vers redirections", value: redirRows.length, tone: redirRows.length === 0 ? "ok" : redirRows.length < 50 ? "warn" : "bad" },
      { label: "Pages sources distinctes", value: new Set(redirRows.map((r) => r.source).filter(Boolean)).size, tone: "info" },
    ],
    xlsx_sheet: redirRows.length > 0 ? subRedirects.xlsx_sheet : undefined,
    issues_count: redirRows.length,
    takeaway: redirRows.length === 0
      ? "Aucun lien interne vers une page redirigée ✓"
      : `${redirRows.length} liens internes pointent vers des pages en 301/302 : à mettre à jour pour pointer directement sur la cible finale.`,
  };

  // ----- Liens HTTP (mixed content) -----
  const httpLinksList = anchors?.http_links || [];
  const httpIssue = findIssue(issues, "sec_inlinks_http");
  const httpRows: AdvIssueRow[] = [];
  const seenHttp = new Set<string>();
  for (const line of (httpIssue?.rows || [])) {
    const key = line.url;
    if (seenHttp.has(key)) continue;
    seenHttp.add(key);
    httpRows.push(toRow(line.url, "high", { source: "", anchor: "" }));
  }
  for (const hl of httpLinksList) {
    const key = `${hl.source}|${hl.destination}`;
    if (seenHttp.has(key)) continue;
    seenHttp.add(key);
    httpRows.push(toRow(hl.destination, "high", { source: hl.source, anchor: hl.anchor }));
  }
  const subHttp: AdvSubcategory = {
    id: "http_mixed_content",
    label: "Liens en HTTP",
    score: scoreFromRatio(httpRows.length / Math.max(rows.length, 1)),
    issues_full: httpRows,
    columns: [
      { key: "url", label: "Destination HTTP", width: 60 },
      { key: "source", label: "Page source", width: 60 },
      { key: "anchor", label: "Ancre", width: 30 },
    ],
    xlsx_sheet: "Liens HTTP (mixte)",
  };
  const slideHttp: AdvSlide = {
    kind: "data",
    section_id: "linking",
    sub_id: "http_mixed_content",
    title: "Liens internes en HTTP (contenu mixte)",
    description: DESC_EXT.http_mixed_content,
    kpis: [
      { label: "Liens HTTP", value: httpRows.length, tone: httpRows.length === 0 ? "ok" : "bad" },
      { label: "Pages sources distinctes", value: new Set(httpRows.map((r) => r.source).filter(Boolean)).size, tone: "info" },
    ],
    xlsx_sheet: httpRows.length > 0 ? subHttp.xlsx_sheet : undefined,
    issues_count: httpRows.length,
    takeaway: httpRows.length === 0
      ? "Aucun lien interne en HTTP ✓"
      : `${httpRows.length} liens internes encore en HTTP : à passer en HTTPS pour éviter l'alerte de contenu mixte.`,
  };

  // Orphans / under-linked. Strict scoring : > 1% orphans is bad,
  // > 5% is critical.
  const subOrphans: AdvSubcategory = {
    id: "orphan_pages",
    label: "Pages orphelines",
    score: Math.min(
      scoreStrict(orphans / Math.max(html.length, 1), 0.01),
      scoreStrict((orphans + low) / Math.max(html.length, 1), 0.05),
    ),
    issues_full: orphanRows,
    columns: [
      { key: "problem", label: "Problème", width: 40 },
      { key: "inlinks", label: "Liens entrants", width: 16 },
      { key: "outlinks", label: "Liens sortants", width: 16 },
      { key: "url", label: "URL", width: 60 },
    ],
    xlsx_sheet: "Pages orphelines",
  };
  const slideOrphans: AdvSlide = {
    kind: "data",
    section_id: "linking",
    sub_id: "orphan_pages",
    title: "Pages sans / avec peu de liens entrants (hors navigation)",
    description: DESC.orphan_pages,
    kpis: [
      { label: "Orphelines", value: orphans, tone: orphans > 0 ? "bad" : "ok" },
      { label: "Sous-maillées (1-2)", value: low, tone: low > 0 ? "warn" : "ok" },
      { label: "Sans lien sortant", value: noOutlinks, tone: noOutlinks > 0 ? "warn" : "ok" },
    ],
    xlsx_sheet: orphanRows.length > 0 ? subOrphans.xlsx_sheet : undefined,
    issues_count: orphanRows.length,
    takeaway: orphans === 0 && low === 0
      ? "Maillage interne sain : aucune page orpheline détectée ✓"
      : `${orphans + low} page(s) sous-maillée(s) à raccrocher au reste du site.`,
  };

  // Anchor analysis : anchors file (liens_entrants_tous.csv) is required in
  // the advanced flow; we still keep a placeholder branch for legacy audits
  // that pre-date this requirement.
  const slidesAnchor: AdvSlide[] = [];
  const subAnchor: AdvSubcategory[] = [];
  if (anchors) {
    const topConc = pickTopConcentratedDestinations(anchors.by_destination, 5, 6);
    // Pull a wider sample of destinations for the diversity scatter plot
    // (4.9) so the chart shows a real distribution and not just 8 points.
    // The 15 worst still come first in the array — the "Top 3 à corriger"
    // widget on the slide reads from the beginning.
    const worst = pickWorstDestinations(anchors.by_destination, 10, 15);
    const scatterSample = sampleForScatter(anchors.by_destination, worst, 120);
    // Build anchor rows for XLSX (one row per link)
    const anchorAllRows: AdvIssueRow[] = anchors.rows.map((r) => ({
      url: r.destination,
      severity: r.is_empty ? "medium" : r.is_generic ? "low" : "info",
      source: r.source,
      anchor: r.anchor || "(vide)",
      position: r.position || ",",
      is_generic: r.is_generic ? "✓" : "",
      is_empty: r.is_empty ? "✓" : "",
    } as AdvIssueRow));

    const subAnchors: AdvSubcategory = {
      id: "anchors_links",
      label: "Texte des ancres (par lien)",
      score: 100, // Reported as data, score driven by overview/diversity below
      issues_full: anchorAllRows,
      columns: [
        { key: "source", label: "Page source", width: 60 },
        { key: "url", label: "Page de destination", width: 60 },
        { key: "anchor", label: "Texte de l'ancre", width: 40 },
        { key: "position", label: "Élément HTML", width: 14 },
        { key: "is_generic", label: "Ancre générique", width: 12 },
        { key: "is_empty", label: "Ancre vide", width: 10 },
      ],
      xlsx_sheet: "Ancres : par lien",
    };
    const subAnchorsDest: AdvSubcategory = {
      id: "anchors_destinations",
      label: "Texte des ancres (par destination)",
      score: 100,
      issues_full: worst.map((w) => ({
        url: w.destination,
        severity: w.diversity_ratio < 0.2 && w.inlinks_count >= 15 ? "high"
          : w.diversity_ratio < 0.4 ? "medium" : "low",
        inlinks_count: w.inlinks_count,
        unique_anchors: w.unique_anchors,
        diversity_ratio: w.diversity_ratio,
        dominant_anchor: w.dominant_anchor,
        dominant_anchor_count: w.dominant_anchor_count,
        dominant_anchor_pct: `${w.dominant_anchor_pct}%`,
      } as AdvIssueRow)),
      columns: [
        { key: "url", label: "Page de destination", width: 60 },
        { key: "inlinks_count", label: "Liens entrants", width: 16 },
        { key: "unique_anchors", label: "Ancres uniques", width: 14 },
        { key: "diversity_ratio", label: "Diversité", width: 12 },
        { key: "dominant_anchor", label: "Ancre dominante", width: 40 },
        { key: "dominant_anchor_count", label: "Occurrences", width: 14 },
        { key: "dominant_anchor_pct", label: "% domination", width: 14 },
      ],
      xlsx_sheet: "Ancres : par destination",
    };
    subAnchor.push(subAnchors, subAnchorsDest);

    slidesAnchor.push({
      kind: "anchor-bars",
      section_id: "linking",
      sub_id: "anchors_overview",
      title: "Texte des ancres : ancres dominantes",
      description: DESC.anchor_bars,
      destinations: topConc.map((d) => {
        // For each destination, compute its top 5 anchors by re-aggregating
        const anchorCounts = new Map<string, number>();
        for (const a of anchors.rows) {
          if (a.destination !== d.destination) continue;
          const k = a.anchor || "(vide)";
          anchorCounts.set(k, (anchorCounts.get(k) || 0) + 1);
        }
        const top = [...anchorCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([text, count]) => ({ text, count }));
        return { destination: d.destination, anchors: top };
      }),
      xlsx_sheet: "Ancres : par lien",
      issues_count: anchorAllRows.length,
    });

    slidesAnchor.push({
      kind: "anchor-table",
      section_id: "linking",
      sub_id: "anchors_diversity",
      title: "Texte des ancres : score de diversité",
      description: DESC.anchor_table,
      rows: scatterSample,
      xlsx_sheet: "Ancres : par destination",
      issues_count: worst.length,
    });
  } else {
    // Placeholder slide explaining that liens_entrants_tous.csv is needed
    slidesAnchor.push({
      kind: "info",
      section_id: "linking",
      sub_id: "anchors_overview",
      title: "Texte des ancres de liens internes",
      description: `Pour activer l'analyse complète du texte des ancres (diversité, sur-optimisation, ancres génériques), uploade le fichier liens_entrants_tous.csv depuis Screaming Frog : Exporter en bloc → Liens → Liens entrants Tous.\n\nL'analyse calcule pour chaque page de destination le ratio d'ancres uniques / liens entrants et identifie les pages qui souffrent de sur-optimisation (même ancre exacte répétée) ou d'ancres trop génériques ("ici", "cliquez", "en savoir plus").`,
      facts: [
        { label: "Fichier requis", value: "liens_entrants_tous.csv" },
        { label: "Source", value: "Exporter en bloc → Liens → Liens entrants Tous" },
        { label: "Filtres appliqués", value: "Hyperlink + interne + hors nav/header/footer" },
      ],
    });
  }

  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "linking",
    title: SECTION_COVER.linking.title,
    eyebrow: "Partie 5 / 6",
    icon: SECTION_COVER.linking.icon,
    bullets: SECTION_COVER.linking.bullets,
  };
  const reco: AdvSlide = {
    kind: "reco",
    section_id: "linking",
    title: "Recommandations : Maillage interne",
    groups: recosForSection("linking"),
  };

  const subcategories = [subOverview, subBroken, subRedirects, subHttp, subOrphans, ...subAnchor];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "linking",
    label: "Maillage interne",
    score: sectionScore,
    weight: 20,
    summary: `${orphans} orphelines · ${brokenIssues.length} liens rompus · ${anchors ? `${anchors.total_links_filtered.toLocaleString("fr-FR")} liens contextuels analysés` : "ancres non analysées (liens_entrants_tous.csv manquant)"}`,
    subcategories,
  };
  return {
    section,
    slides: [cover, slideOverview, slideBroken, slideRedirects, slideHttp, slideOrphans, ...slidesAnchor, reco],
  };
}

// ---------- Images section -------------------------------------------------

function buildImages(
  rows: InternalRow[],
  issues: ParsedIssue[],
  imagesAll: ImagesAllParseResult | null,
): { section: AdvSection; slides: AdvSlide[] } {
  // Fallback: derive image set from interne_html.csv content-type when
  // images_tous.csv isn't provided (legacy/empty audits).
  const internalImages = rows.filter((r) => r.content_type && /^image\//i.test(r.content_type));
  const imagesList = imagesAll && imagesAll.rows.length > 0
    ? imagesAll.rows.map((img) => ({ url: img.url, size_bytes: img.size_bytes, inlinks_img: img.inlinks_img }))
    : internalImages.map((r) => ({ url: r.url, size_bytes: r.size_bytes, inlinks_img: null as number | null }));

  const altMissing = findIssue(issues, "image_alt_missing");
  const sizeMissing = findIssue(issues, "image_size_missing");

  // Some Screaming Frog Issues exports emit one row per (image URL × page
  // that uses the image) pair instead of one row per unique image : so a
  // crawl with 36 unique images can yield 3 000+ rows for "missing alt"
  // or "missing width/height". Dedupe by URL so the slide counts match
  // the actual number of images to fix.
  function dedupByUrl(rows: AdvIssueRow[]): AdvIssueRow[] {
    const seen = new Set<string>();
    const out: AdvIssueRow[] = [];
    for (const r of rows) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      out.push(r);
    }
    return out;
  }

  // Alt
  const altRows = dedupByUrl(issueAsRows(altMissing, "medium", (l) => ({
    ref_pages: l.extras["nombre de liens entrants"] || l.extras["liens entrants img"] || l.extras["inlinks"] || "",
  })));
  const subAlt: AdvSubcategory = {
    id: "image_alt",
    label: "Images sans alt",
    score: scoreFromRatio(altRows.length / Math.max(imagesList.length, 1)),
    issues_full: altRows,
    columns: [
      { key: "ref_pages", label: "Pages référençantes", width: 18 },
      { key: "url", label: "URL image", width: 60 },
    ],
    xlsx_sheet: "Images sans alt",
  };
  // "Pages affectées" = sum of "Liens entrants IMG" across alt-less images.
  // For the user's reference case this lifts an apparent "1 image" from
  // looking trivial to "682 pages affected", which makes the priority
  // immediately legible on the slide.
  const altPagesAffected = (altMissing?.rows || []).reduce((s, l) => {
    const n = parseInt(l.extras["liens entrants img"] || l.extras["nombre de liens entrants"] || l.extras["inlinks"] || "0", 10);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const slideAlt: AdvSlide = {
    kind: "data",
    section_id: "images",
    sub_id: "image_alt",
    title: "Images sans attribut alt",
    description: DESC.images_alt,
    kpis: [
      { label: "Images crawlées", value: imagesList.length, tone: "ok" },
      { label: "Sans attribut alt", value: altRows.length, tone: altRows.length > 0 ? "bad" : "ok" },
      { label: "% sans alt", value: imagesList.length > 0 ? `${Math.round((altRows.length / imagesList.length) * 100)} %` : "0 %", tone: altRows.length > 0 ? "warn" : "ok" },
      { label: "Pages affectées", value: altPagesAffected.toLocaleString("fr-FR"), tone: altPagesAffected > 50 ? "warn" : "info" },
    ],
    xlsx_sheet: altRows.length > 0 ? subAlt.xlsx_sheet : undefined,
    issues_count: altRows.length,
    takeaway: altRows.length === 0
      ? "Toutes les images crawlées ont un attribut alt ✓"
      : altRows.length === 1 && altPagesAffected > 50
        ? `1 image sans alt mais référencée sur ${altPagesAffected.toLocaleString("fr-FR")} pages : typiquement un visuel de template (logo, footer). Un seul fix corrige toutes les occurrences.`
        : `${altRows.length} image(s) unique(s) sans alt sur ${altPagesAffected.toLocaleString("fr-FR")} page(s) cumulée(s).`,
  };

  // Size attrs (width/height missing).
  //
  // Screaming Frog FR emits this file in LINK-CENTRIC form: one row per
  // (page × image) occurrence, with Source = the page, Destination = the
  // image URL. We already extract Destination as the row URL upstream, so
  // dedupByUrl gives us unique images. But the raw occurrence count and
  // the distinct-pages-affected count are equally useful for the slide ,
  // a single image present on 1 040 pages is one template fix, not 1 040
  // separate jobs.
  const sizeRawRows = sizeMissing?.rows || [];
  const sizeOccurrences = sizeRawRows.length;
  const sizeUniquePages = new Set(
    sizeRawRows.map((l) => l.extras["source"] || l.extras["page source"] || "").filter(Boolean),
  ).size;
  const sizeAttrRows = dedupByUrl(issueAsRows(sizeMissing, "medium", (l) => ({
    problem: "Attributs largeur/hauteur manquants (impact CLS)",
    source: l.extras["source"] || l.extras["page source"] || "",
    position: l.extras["position du lien"] || "",
  })));
  const subSize: AdvSubcategory = {
    id: "image_size_attr",
    label: "Images sans width/height",
    score: scoreFromRatio(sizeAttrRows.length / Math.max(imagesList.length, 1)),
    issues_full: sizeAttrRows,
    columns: [
      { key: "problem", label: "Problème", width: 50 },
      { key: "position", label: "Emplacement", width: 16 },
      { key: "url", label: "URL image", width: 60 },
      { key: "source", label: "Exemple page source", width: 60 },
    ],
    xlsx_sheet: "Images sans dimensions",
  };
  const slideSize: AdvSlide = {
    kind: "data",
    section_id: "images",
    sub_id: "image_size_attr",
    title: "Images sans attributs width/height",
    description: DESC.images_size_attr,
    kpis: [
      { label: "Images uniques concernées", value: sizeAttrRows.length, tone: sizeAttrRows.length > 0 ? "warn" : "ok" },
      { label: "Occurrences sur le site", value: sizeOccurrences.toLocaleString("fr-FR"), tone: sizeOccurrences > 100 ? "warn" : "info" },
      { label: "Pages affectées", value: sizeUniquePages.toLocaleString("fr-FR"), tone: sizeUniquePages > 100 ? "warn" : "info" },
      { label: "Impact CLS", value: sizeAttrRows.length > 0 ? "Élevé" : "Faible", tone: sizeAttrRows.length > 0 ? "bad" : "ok" },
    ],
    xlsx_sheet: sizeAttrRows.length > 0 ? subSize.xlsx_sheet : undefined,
    issues_count: sizeAttrRows.length,
    takeaway: sizeAttrRows.length === 0
      ? "Toutes les images crawlées déclarent width/height ✓"
      : sizeAttrRows.length === 1 && sizeOccurrences > 50
        ? `1 image unique mal balisée mais ${sizeOccurrences.toLocaleString("fr-FR")} occurrences : typiquement un visuel de template (footer, header). Un seul fix dans le template corrige tout.`
        : sizeAttrRows.length < 10
          ? `${sizeAttrRows.length} images uniques à corriger, présentes ${sizeOccurrences.toLocaleString("fr-FR")} fois : quelques fixes ciblés.`
          : `${sizeAttrRows.length.toLocaleString("fr-FR")} images uniques sans width/height sur ${sizeUniquePages.toLocaleString("fr-FR")} pages : chantier transversal sur les templates de contenu.`,
  };

  // Weight : driven by images_tous.csv when available (full distribution),
  // otherwise falls back to interne_html.csv image rows.
  let totalKb = 0;
  let under100 = 0;
  let heavyCount = 0;
  let veryHeavy = 0;
  const heavyRows: AdvIssueRow[] = [];
  for (const img of imagesList) {
    const kb = img.size_bytes ? img.size_bytes / 1024 : 0;
    totalKb += kb;
    if (kb < 100) under100++;
    else if (kb >= 1024) {
      veryHeavy++;
      heavyRows.push(toRow(img.url, "high", { size_kb: Math.round(kb), category: "> 1 Mo", ref_pages: img.inlinks_img ?? "" }));
    } else {
      heavyCount++;
      heavyRows.push(toRow(img.url, "medium", { size_kb: Math.round(kb), category: "100 Ko – 1 Mo", ref_pages: img.inlinks_img ?? "" }));
    }
  }
  const avgKb = imagesList.length > 0 ? Math.round(totalKb / imagesList.length) : 0;
  const subWeight: AdvSubcategory = {
    id: "image_weight",
    label: "Poids images",
    score: scoreFromRatio((veryHeavy * 1 + heavyCount * 0.3) / Math.max(imagesList.length, 1)),
    issues_full: heavyRows,
    columns: [
      { key: "size_kb", label: "Poids (Ko)", width: 14 },
      { key: "category", label: "Catégorie", width: 18 },
      { key: "ref_pages", label: "Pages référençantes", width: 18 },
      { key: "url", label: "URL image", width: 60 },
    ],
    xlsx_sheet: "Poids images",
  };
  const slideWeight: AdvSlide = {
    kind: "data",
    section_id: "images",
    sub_id: "image_weight",
    title: "Poids des images",
    description: DESC.images_weight,
    kpis: [
      { label: "Total images", value: imagesList.length, tone: "ok" },
      { label: "Poids moyen", value: `${avgKb} Ko`, tone: avgKb > 200 ? "warn" : "ok" },
      { label: "> 100 Ko", value: heavyCount + veryHeavy, tone: heavyCount + veryHeavy > 0 ? "warn" : "ok" },
      { label: "> 1 Mo", value: veryHeavy, tone: veryHeavy > 0 ? "bad" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "< 100 Ko", value: under100, color: COLORS.ok },
        { label: "100 Ko – 1 Mo", value: heavyCount, color: COLORS.warn },
        { label: "> 1 Mo", value: veryHeavy, color: COLORS.bad },
      ],
    },
    xlsx_sheet: heavyRows.length > 0 ? subWeight.xlsx_sheet : undefined,
    issues_count: heavyRows.length,
  };

  // ----- Format distribution (JPEG / PNG / WebP / AVIF / SVG / autre)
  // Datashake-style insight: knowing that 98 % of the parc is still JPEG/PNG
  // is far more actionable than just "X images > 100 Ko".
  const formatCounts: Record<string, number> = {};
  for (const img of imagesList) {
    const ext = extractFormat(img.url);
    formatCounts[ext] = (formatCounts[ext] || 0) + 1;
  }
  const totalImages = imagesList.length || 1;
  const modernCount = (formatCounts["webp"] || 0) + (formatCounts["avif"] || 0);
  const legacyCount = (formatCounts["jpeg"] || 0) + (formatCounts["jpg"] || 0) + (formatCounts["png"] || 0);
  const modernPct = Math.round((modernCount / totalImages) * 1000) / 10;
  const legacyPct = Math.round((legacyCount / totalImages) * 1000) / 10;

  const subFormats: AdvSubcategory = {
    id: "image_formats",
    label: "Formats d'images",
    score: scoreFromRatio(legacyCount / totalImages),
    issues_full: [],
    columns: [],
    xlsx_sheet: "Formats d'images",
  };
  const formatSegments = Object.entries(formatCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([fmt, count]) => {
      const color =
        fmt === "webp" || fmt === "avif" ? COLORS.ok :
        fmt === "svg" ? COLORS.info :
        fmt === "jpeg" || fmt === "jpg" ? COLORS.warn :
        fmt === "png" ? COLORS.warn :
        COLORS.muted;
      return { label: fmt.toUpperCase(), value: count, color };
    });
  const slideFormats: AdvSlide = {
    kind: "data",
    section_id: "images",
    sub_id: "image_formats",
    title: "Formats d'images servis",
    description: DESC_EXT.image_formats,
    kpis: [
      { label: "Total images", value: imagesList.length, tone: "ok" },
      { label: "Formats modernes (WebP/AVIF)", value: `${modernCount} · ${modernPct} %`, tone: modernPct >= 50 ? "ok" : modernPct > 0 ? "warn" : "bad" },
      { label: "Formats legacy (JPEG/PNG)", value: `${legacyCount} · ${legacyPct} %`, tone: legacyPct < 30 ? "ok" : legacyPct < 70 ? "warn" : "bad" },
    ],
    chart: {
      type: "donut",
      segments: formatSegments,
    },
    issues_count: 0,
    takeaway: modernPct === 0
      ? `${legacyPct} % du parc en JPEG/PNG, WebP/AVIF quasi-absent : gros gain potentiel sur LCP en convertissant les visuels de dessus de page.`
      : modernPct >= 50
        ? `${modernPct} % du parc déjà en formats modernes : bonne base, à étendre.`
        : `${modernPct} % en formats modernes : la conversion progresse, à poursuivre sur les LP stratégiques.`,
  };

  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "images",
    title: SECTION_COVER.images.title,
    eyebrow: "Partie 6 / 8",
    icon: SECTION_COVER.images.icon,
    bullets: SECTION_COVER.images.bullets,
  };
  const reco: AdvSlide = {
    kind: "reco",
    section_id: "images",
    title: "Recommandations : Images",
    groups: recosForSection("images"),
  };

  const subcategories = [subAlt, subSize, subWeight, subFormats];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "images",
    label: "Images",
    score: sectionScore,
    weight: 10,
    summary: `${imagesList.length.toLocaleString("fr-FR")} images · ${altRows.length} sans alt · ${sizeAttrRows.length} sans dimensions · ${heavyCount + veryHeavy} > 100 Ko`,
    subcategories,
  };
  return { section, slides: [cover, slideAlt, slideSize, slideWeight, slideFormats, reco] };
}

// ---------- Données structurées section ------------------------------------

// Schémas qu'on flag comme critiques pour une LP / un site e-commerce
// classique. Order matters : the order here drives the "missing schemas"
// list on the slide so the most impactful absences surface first.
const CRITICAL_SCHEMAS: Array<{
  schema: string;
  label: string;
  blurb: string;
}> = [
  { schema: "Organization", label: "Organization", blurb: "Identité de l'entreprise (logo, contact, profils sociaux) : fondation du Knowledge Panel." },
  { schema: "WebSite", label: "WebSite", blurb: "Déclaration du site (URL, nom, recherche interne) : signal de base attendu sur la home." },
  { schema: "BreadcrumbList", label: "BreadcrumbList", blurb: "Fil d'Ariane affichable directement en SERP : gros gain de lisibilité." },
  { schema: "Product", label: "Product", blurb: "Pages produit : nom, image, marque, prix (avec Offer). Débloque les étoiles + prix en SERP." },
  { schema: "Offer", label: "Offer", blurb: "Prix, disponibilité, devise : combiné à Product pour les rich results commerce." },
  { schema: "AggregateRating", label: "AggregateRating", blurb: "Note moyenne + nombre d'avis : affiche les étoiles en SERP, +20-30 % de CTR." },
  { schema: "FAQPage", label: "FAQPage", blurb: "Questions-réponses : affichage déroulant en SERP, capture les People Also Ask." },
  { schema: "Article", label: "Article", blurb: "Articles éditoriaux : auteur, date, image : éligible à Top Stories." },
  { schema: "LocalBusiness", label: "LocalBusiness", blurb: "Si présence physique : adresse, horaires, géoloc : débloque le Local Pack." },
];

function buildStructuredData(res: SiteResources | null): { section: AdvSection; slides: AdvSlide[] } {
  const sd = res?.structured_data;
  const homepageFetched = sd?.homepage_fetched === true;
  const schemasFound = new Set(
    (sd?.schemas_found || []).map((s) => s.toLowerCase()),
  );
  const blocksCount = sd?.blocks_count || 0;

  const missing = CRITICAL_SCHEMAS.filter(
    (c) => !schemasFound.has(c.schema.toLowerCase()),
  );
  const present = CRITICAL_SCHEMAS.filter(
    (c) => schemasFound.has(c.schema.toLowerCase()),
  );

  // Section cover
  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "structured_data",
    title: SECTION_COVER.structured_data.title,
    eyebrow: "Partie 7 / 8",
    icon: SECTION_COVER.structured_data.icon,
    bullets: SECTION_COVER.structured_data.bullets,
  };

  // Slide 1 : JSON-LD détectées sur la home
  const slideDetected: AdvSlide = {
    kind: "data",
    section_id: "structured_data",
    sub_id: "schemas_detected",
    title: "Données structurées détectées sur la page d'accueil",
    description: DESC_EXT.structured_data + (homepageFetched
      ? `\n\nNous avons analysé le HTML de la page d'accueil et détecté ${blocksCount} bloc(s) JSON-LD, couvrant ${schemasFound.size} type(s) de schéma.`
      : "\n\n⚠️ Impossible d'analyser la page d'accueil automatiquement. Vérifie manuellement avec l'outil Google Rich Results Test."),
    kpis: [
      { label: "Blocs JSON-LD", value: blocksCount, tone: blocksCount > 0 ? "ok" : "bad" },
      { label: "Schémas distincts", value: schemasFound.size, tone: schemasFound.size > 2 ? "ok" : schemasFound.size > 0 ? "warn" : "bad" },
      { label: "Schémas critiques manquants", value: missing.length, tone: missing.length === 0 ? "ok" : missing.length > 4 ? "bad" : "warn" },
    ],
    issues_count: 0,
    takeaway: homepageFetched
      ? (schemasFound.size === 0
        ? "Aucun JSON-LD sur la home : c'est le premier signal manquant pour les rich snippets et les moteurs IA."
        : missing.length > 4
          ? `${missing.length} schémas critiques absents sur ${CRITICAL_SCHEMAS.length} attendus : fort potentiel d'amélioration.`
          : `${present.length}/${CRITICAL_SCHEMAS.length} schémas critiques présents : bonne base, à étendre.`)
      : undefined,
  };

  // Slide 2 : Schémas critiques absents (one per row)
  const missingRows: AdvIssueRow[] = missing.map((m) => ({
    url: m.schema,
    severity: ["Organization", "WebSite", "Product"].includes(m.schema) ? "high" : "medium",
    schema: m.schema,
    impact: m.blurb,
  } as AdvIssueRow));
  const subDetected: AdvSubcategory = {
    id: "schemas_detected",
    label: "JSON-LD détectés",
    score: schemasFound.size > 0 ? 100 : 0,
    issues_full: [],
    columns: [],
    xlsx_sheet: "Données structurées",
  };
  const subMissing: AdvSubcategory = {
    id: "schemas_missing",
    label: "Schémas critiques manquants",
    score: scoreFromRatio(missing.length / CRITICAL_SCHEMAS.length),
    issues_full: missingRows,
    columns: [
      { key: "schema", label: "Schéma", width: 24 },
      { key: "impact", label: "Pourquoi c'est important", width: 80 },
    ],
    xlsx_sheet: "Schémas manquants",
  };

  // Recommendations slide
  const slideReco: AdvSlide = {
    kind: "reco",
    section_id: "structured_data",
    title: "Recommandations : Données structurées",
    groups: recosForSection("structured_data"),
  };

  const subcategories = [subDetected, subMissing];
  const sectionScore = Math.round(
    subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length,
  );
  const section: AdvSection = {
    id: "structured_data",
    label: "Données structurées",
    score: sectionScore,
    weight: 8,
    summary: `${blocksCount} blocs JSON-LD · ${schemasFound.size} schémas distincts · ${missing.length} schémas critiques manquants`,
    subcategories,
  };

  return { section, slides: [cover, slideDetected, slideReco] };
}

// ---------- GEO (Generative Engine Optimization) section --------------------

const ALL_IA_BOTS = [
  "gptbot", "chatgpt-user", "ccbot", "google-extended",
  "claudebot", "anthropic-ai", "perplexitybot",
  "applebot-extended", "bytespider", "meta-externalagent", "cohere-ai",
];

function buildGeo(rows: InternalRow[], res: SiteResources | null): { section: AdvSection; slides: AdvSlide[] } {
  const robots = res?.robots_txt;
  const declared = robots?.ia_bots_declared || [];
  const blocked = robots?.ia_bots_blocked || [];
  const allowed = robots?.ia_bots_allowed || [];
  const missing = ALL_IA_BOTS.filter((b) => !declared.includes(b));

  // ----- Slide 1: Accès des crawlers IA -----
  const subBots: AdvSubcategory = {
    id: "ia_bots",
    label: "Crawlers IA",
    score: scoreFromRatio((blocked.length * 1 + missing.length * 0.2) / ALL_IA_BOTS.length),
    issues_full: [
      ...blocked.map((b) => ({
        url: b,
        severity: "critical" as Severity,
        bot: b,
        status: "Bloqué",
        recommendation: "Retirer le Disallow: / ou remplacer par Allow: /",
      } as AdvIssueRow)),
      ...missing.map((b) => ({
        url: b,
        severity: "medium" as Severity,
        bot: b,
        status: "Non déclaré",
        recommendation: "Ajouter User-agent: " + b + " avec Allow: /",
      } as AdvIssueRow)),
    ],
    columns: [
      { key: "bot", label: "Bot IA", width: 24 },
      { key: "status", label: "Statut", width: 16 },
      { key: "recommendation", label: "Action", width: 60 },
    ],
    xlsx_sheet: "Bots IA",
  };
  const slideBots: AdvSlide = {
    kind: "data",
    section_id: "geo",
    sub_id: "ia_bots",
    title: "Accès des crawlers IA dans le robots.txt",
    description: DESC_EXT.ia_crawlers,
    kpis: [
      { label: "Bots IA déclarés", value: declared.length, tone: declared.length >= 4 ? "ok" : declared.length > 0 ? "warn" : "bad" },
      { label: "Autorisés (Allow: /)", value: allowed.length, tone: allowed.length > 0 ? "ok" : "warn" },
      { label: "Bloqués (Disallow: /)", value: blocked.length, tone: blocked.length === 0 ? "ok" : "bad" },
      { label: "Non déclarés", value: missing.length, tone: missing.length > 6 ? "warn" : "ok" },
    ],
    xlsx_sheet: subBots.issues_full.length > 0 ? subBots.xlsx_sheet : undefined,
    issues_count: subBots.issues_full.length,
    takeaway: blocked.length > 0
      ? `${blocked.length} bot(s) IA explicitement bloqué(s) : votre contenu n'apparaît pas dans leurs réponses.`
      : declared.length === 0
        ? "Aucun bot IA explicitement déclaré : l'accès passe par la règle User-agent: *. Déclarer explicitement supprime tout risque d'ambiguïté."
        : `${declared.length} bot(s) IA déclaré(s) explicitement : bonne posture GEO.`,
  };

  // ----- Slide 2: Fichier llms.txt -----
  const llmsFetched = res?.llms_txt.fetched === true;
  const llmsLines = res?.llms_txt.lines ?? null;
  const slideLlms: AdvSlide = {
    kind: "info",
    section_id: "geo",
    sub_id: "llms_txt",
    title: "Fichier llms.txt",
    description: DESC.llms_txt,
    facts: [
      { label: "Statut sur le site", value: llmsFetched ? "✓ Présent" : "✗ Absent" },
      { label: "Sites adopteurs (2026)", value: "+ 844 000" },
      { label: "Adopteurs notables", value: "Anthropic, Cloudflare, Stripe" },
    ],
    callout: {
      tone: "warn",
      title: "À prendre avec des pincettes",
      body: DESC.llms_txt_callout,
    },
  };

  // ----- Slide 3: Rendu sans JavaScript (informational) -----
  // Pas de KPI, pas de grille de facts : c'est une slide pédagogique
  // que le consultant complète manuellement avec une capture d'écran de
  // son test avant/après désactivation du JavaScript. On laisse un
  // emplacement screenshot vide à droite + un callout "Comment tester"
  // en vouvoiement.
  const slideJs: AdvSlide = {
    kind: "info",
    section_id: "geo",
    sub_id: "js_rendering",
    title: "Rendu sans JavaScript",
    description: DESC_EXT.js_rendering,
    screenshot_placeholder: true,
    callout: {
      tone: "info",
      title: "Comment tester rapidement",
      body: "Désactivez JavaScript dans votre navigateur (DevTools → Settings → Disable JavaScript), puis rechargez la page. Tout ce qui disparaît est invisible pour les bots IA. À tester sur au moins une page de chaque template (accueil, fiche produit, article, FAQ, formulaire).",
    },
  };

  // ----- Slide 4: Headers HTTP ETag & Last-Modified -----
  const hsample = res?.headers_sample;
  const sampled = hsample?.sample_size || 0;
  const withEtag = hsample?.with_etag || 0;
  const withLm = hsample?.with_last_modified || 0;
  const subHeaders: AdvSubcategory = {
    id: "http_headers",
    label: "Headers HTTP (ETag / Last-Modified)",
    score: sampled === 0 ? 50 : scoreFromRatio(1 - (withEtag / sampled)),
    issues_full: [],
    columns: [],
    xlsx_sheet: "Headers HTTP",
  };
  // Méthodologie : on échantillonne 5 URLs (page d'accueil + 4 URLs
  // tirées du sitemap), on envoie une requête HEAD à chacune, on compte
  // combien renvoient un header ETag et combien renvoient Last-Modified.
  // Échantillon faible mais représentatif : si le serveur ne renvoie ces
  // headers sur AUCUNE des 5 URLs testées, c'est qu'ils ne sont pas
  // configurés au niveau du CDN ou du framework, et la conclusion vaut
  // pour tout le site.
  const slideHeaders: AdvSlide = {
    kind: "data",
    section_id: "geo",
    sub_id: "http_headers",
    title: "Headers ETag & Last-Modified",
    description: DESC_EXT.http_headers + `\n\nMéthode : nous envoyons 5 requêtes HEAD (page d'accueil + 4 URLs du sitemap) et comptons combien renvoient un ETag et un Last-Modified. Si le serveur ne les renvoie sur aucune des 5 URLs testées, la configuration manque au niveau CDN ou framework et la conclusion vaut pour l'ensemble du site.`,
    kpis: [
      { label: "URLs testées (HEAD)", value: sampled, tone: "info" },
      { label: "Avec ETag", value: `${withEtag} / ${sampled}`, tone: sampled > 0 && withEtag === sampled ? "ok" : withEtag > 0 ? "warn" : "bad" },
      { label: "Avec Last-Modified", value: `${withLm} / ${sampled}`, tone: sampled > 0 && withLm === sampled ? "ok" : withLm > 0 ? "warn" : "bad" },
      { label: "Couverture globale", value: sampled > 0 ? `${Math.round(((withEtag + withLm) / (sampled * 2)) * 100)} %` : ", ", tone: "info" },
    ],
    issues_count: 0,
    takeaway: sampled === 0
      ? "Échantillonnage indisponible. Vérifiez manuellement avec un curl -I sur quelques URLs."
      : withEtag === sampled && withLm === sampled
        ? `Toutes les ${sampled} pages testées renvoient ETag ET Last-Modified : configuration optimale pour le budget de crawl.`
        : withEtag === 0 && withLm === 0
          ? `Aucune des ${sampled} pages testées ne renvoie ni ETag ni Last-Modified. Chaque visite des crawlers (Google, GPTBot, ClaudeBot) re-télécharge intégralement le HTML, même quand le contenu n'a pas changé. Configuration à ajouter côté CDN ou serveur.`
          : withEtag === 0
            ? `Aucune des ${sampled} pages testées n'a d'ETag (mais ${withLm}/${sampled} ont Last-Modified). À compléter pour permettre les requêtes conditionnelles 304 Not Modified.`
            : `${sampled - withEtag} page(s) sur ${sampled} sans ETag : pertes de budget de crawl côté Googlebot et bots IA.`,
  };

  // Section cover + reco
  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "geo",
    title: SECTION_COVER.geo.title,
    eyebrow: "Partie 8 / 8",
    icon: SECTION_COVER.geo.icon,
    bullets: SECTION_COVER.geo.bullets,
  };
  const slideReco: AdvSlide = {
    kind: "reco",
    section_id: "geo",
    title: "Recommandations : Optimisation pour les IA (GEO)",
    groups: recosForSection("geo"),
  };

  // Score: penalize blocked bots more than missing declarations
  const botsScore = scoreFromRatio((blocked.length * 1 + Math.min(missing.length, 8) * 0.1) / 8);
  const headersScore = subHeaders.score;
  const llmsScore = llmsFetched ? 100 : 60;
  const subcategories = [subBots, subHeaders];
  const sectionScore = Math.round((botsScore + headersScore + llmsScore) / 3);
  const section: AdvSection = {
    id: "geo",
    label: "Optimisation pour les IA (GEO)",
    score: sectionScore,
    weight: 12,
    summary: `${declared.length}/${ALL_IA_BOTS.length} bots IA déclarés · llms.txt ${llmsFetched ? "présent" : "absent"} · ${sampled > 0 ? `${withEtag}/${sampled} ETag` : "headers non échantillonnés"}`,
    subcategories,
  };

  return { section, slides: [cover, slideBots, slideLlms, slideJs, slideHeaders, slideReco] };
}

// ---------- Priorities -----------------------------------------------------

const SECTION_WEIGHT_FOR_PRIORITY: Record<string, number> = {
  indexability_crawl: 1.2,
  performance: 1.0,
  meta: 0.9,
  structure: 0.7,
  linking: 1.1,
  images: 0.7,
  structured_data: 0.9,
  geo: 1.0,
};

const SEV_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0.3,
};

// "Effort" heuristics: some fixes are quick (one file to update),
// others are deep (refactor structure/content).
const SUB_EFFORT: Record<string, "quick-win" | "medium" | "deep"> = {
  robots_sitemap: "quick-win",
  http_codes: "medium",
  hreflang: "medium",
  canonical: "quick-win",
  noindex_pages: "quick-win",
  depth: "deep",
  response_time: "deep",
  html_weight: "medium",
  titles_meta_basic: "medium",
  title_duplicate: "medium",
  meta_duplicate: "medium",
  h1_duplicate: "medium",
  hn_structure: "deep",
  hn_hierarchy: "deep",
  internal_linking_overview: "deep",
  broken_links: "quick-win",
  internal_redirects: "quick-win",
  http_mixed_content: "quick-win",
  orphan_pages: "medium",
  anchors_links: "deep",
  anchors_destinations: "deep",
  image_alt: "medium",
  image_size_attr: "quick-win",
  image_weight: "medium",
  image_formats: "medium",
  schemas_detected: "medium",
  schemas_missing: "medium",
  ia_bots: "quick-win",
  http_headers: "medium",
};

// Subcategories that are observational, not actionable issues. The
// noindex list is a manual review item, not a fix to prioritise.
// schemas_detected is the "present schemas" inventory (positive).
// anchors_links / anchors_destinations are exposed as anchor slides but
// don't belong in a priority ranking on their own — the actionable signal
// is the over-optimisation pattern, surfaced visually on the slide.
const INFORMATIONAL_SUB_IDS = new Set([
  "noindex_pages",
  "schemas_detected",
  "anchors_links",
  "anchors_destinations",
]);

function buildPriorities(sections: AdvSection[]): PriorityItem[] {
  const items: PriorityItem[] = [];
  for (const sec of sections) {
    const secWeight = SECTION_WEIGHT_FOR_PRIORITY[sec.id] || 1;
    for (const sub of sec.subcategories) {
      if (sub.issues_full.length === 0) continue;
      if (INFORMATIONAL_SUB_IDS.has(sub.id)) continue;
      // Skip subcategories whose only severity is "info" — those are
      // observations, not fixes.
      const hasActionableSev = sub.issues_full.some(
        (r) => r.severity !== "info",
      );
      if (!hasActionableSev) continue;
      // Aggregate severity counts
      const sevCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const r of sub.issues_full) sevCount[r.severity]++;
      const affected = sub.issues_full.length;
      // Severity-weighted base score, biased by section weight.
      const rawScore = (
        sevCount.critical * SEV_WEIGHT.critical +
        sevCount.high * SEV_WEIGHT.high +
        sevCount.medium * SEV_WEIGHT.medium +
        sevCount.low * SEV_WEIGHT.low
      ) * secWeight;
      // Urgency : volume-aware so a 1 250-row "low severity" finding
      // doesn't get classed Low. Major refactor from the previous
      // logic which never escalated on volume alone.
      const urgency: PriorityItem["urgency"] =
        sevCount.critical > 0 || affected > 2000 ? "critical"
          : sevCount.high > 5 || affected > 500 ? "high"
            : sevCount.high > 0 || sevCount.medium > 10 || affected > 100 ? "medium"
              : "low";
      const effort = SUB_EFFORT[sub.id] || "medium";
      // Impact : blend section weight + volume so a low-weight section
      // with thousands of problems doesn't read as "Faible impact".
      const impactScore = secWeight * 0.5 + Math.min(affected / 100, 10) * 0.5;
      const impact: PriorityItem["impact"] = impactScore >= 1.5 ? "high" : impactScore >= 0.8 ? "medium" : "low";
      items.push({
        rank: 0,
        section_id: sec.id,
        sub_id: sub.id,
        title: sub.label,
        urgency,
        rationale: buildRationale(sub.label, sub.issues_full.length, sevCount.critical, sevCount.high, effort, impact),
        affected: sub.issues_full.length,
        effort,
        impact,
      });
      // Stash for sort
      (items[items.length - 1] as { _raw?: number })._raw = rawScore;
    }
  }
  items.sort((a, b) => ((b as { _raw?: number })._raw ?? 0) - ((a as { _raw?: number })._raw ?? 0));
  items.forEach((it, i) => { it.rank = i + 1; delete (it as { _raw?: number })._raw; });
  return items.slice(0, 12); // Top 12 priorities : fits in 1-2 slides cleanly
}

function buildRationale(label: string, affected: number, critical: number, high: number, effort: string, impact: string): string {
  const sevPart = critical > 0
    ? `${critical} cas critique${critical > 1 ? "s" : ""}`
    : high > 0
      ? `${high} cas urgent${high > 1 ? "s" : ""}`
      : `${affected} cas`;
  const effortPart = effort === "quick-win" ? "quick win" : effort === "medium" ? "effort modéré" : "chantier";
  const impactPart = impact === "high" ? "fort impact SEO" : impact === "medium" ? "impact modéré" : "impact ciblé";
  return `${affected} URLs concernées (${sevPart}) · ${effortPart} · ${impactPart}.`;
}

// ---------- Orchestrator ---------------------------------------------------

export type AdvancedAnalyzeOpts = {
  source_filename: string | null;
  domain: string | null;
  site_resources: SiteResources | null;
  anchors: AnchorsParseResult | null;
  images_all: ImagesAllParseResult | null;
  // How many pagination URLs were stripped from interne_html.csv at
  // parse time. Threaded through into report.diagnostics for the
  // Exclusions sheet in the XLSX.
  pagination_excluded?: number;
};

export function analyzeAdvanced(
  rows: InternalRow[],
  issues: ParsedIssue[],
  opts: AdvancedAnalyzeOpts,
): AdvReport {
  const htmlCount = rows.filter(isHtml).length;

  const { section: secIdx, slides: slIdx } = buildIndexabilityCrawl(rows, issues, opts.site_resources);
  const { section: secPerf, slides: slPerf } = buildPerformance(rows);
  const { section: secMeta, slides: slMeta } = buildMeta(rows, issues);
  const { section: secStruct, slides: slStruct } = buildStructure(rows, issues);
  const { section: secLink, slides: slLink } = buildLinking(rows, issues, opts.anchors);
  const { section: secImg, slides: slImg } = buildImages(rows, issues, opts.images_all);
  // New sections inspired by the datashake / SEO-agency benchmark:
  //  • Données structurées (JSON-LD) : analyses the homepage HTML
  //  • Optimisation pour les IA (GEO) : bots IA in robots.txt, llms.txt,
  //    JS rendering, ETag/Last-Modified headers
  const { section: secSD, slides: slSD } = buildStructuredData(opts.site_resources);
  const { section: secGeo, slides: slGeo } = buildGeo(rows, opts.site_resources);

  const sections = [secIdx, secPerf, secMeta, secStruct, secLink, secImg, secSD, secGeo];
  const totalWeight = sections.reduce((s, c) => s + c.weight, 0);
  const weightedSum = sections.reduce((s, c) => s + c.score * c.weight, 0);
  const global_score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  const priorities = buildPriorities(sections);

  // Final slide list
  const totalIssues = sections.reduce(
    (s, sec) => s + sec.subcategories.reduce((acc, sub) => acc + sub.issues_full.length, 0),
    0,
  );

  const coverSlide: AdvSlide = {
    kind: "cover",
    audit_name: "",
    url_count: rows.length,
    sections_count: sections.length,
    issues_count: totalIssues,
    generated_at: new Date().toISOString(),
  };

  const summarySlide: AdvSlide = {
    kind: "summary",
    sections: sections.map((s) => ({
      id: s.id,
      label: s.label,
      score: s.score,
      weight: s.weight,
      summary: s.summary,
    })),
    global_score,
  };

  const prioritySlide: AdvSlide = {
    kind: "priority",
    title: "Priorisation des corrections",
    items: priorities,
    ai_summary: null,
    ai_summary_error: null,
  };

  const slides: AdvSlide[] = [
    coverSlide,
    summarySlide,
    ...slIdx,
    ...slPerf,
    ...slMeta,
    ...slStruct,
    ...slLink,
    ...slImg,
    ...slSD,
    ...slGeo,
    prioritySlide,
  ];

  const diagnostics: AdvReport["diagnostics"] = {
    pagination_excluded_count: opts.pagination_excluded ?? 0,
    html_pages_count: htmlCount,
    indexable_html_count: rows.filter(isHtml).filter(isIndexable).length,
    contextual_links_count: opts.anchors?.total_links_filtered ?? 0,
    editorial_links_count: opts.anchors?.total_editorial_links ?? 0,
    empty_editorial_anchor_count: opts.anchors?.empty_editorial_anchors ?? 0,
    anchor_filter_breakdown: opts.anchors?.filtered_breakdown
      ? {
        template_cta: opts.anchors.filtered_breakdown.template_cta,
        image_wrapping: opts.anchors.filtered_breakdown.image_wrapping,
        card_path: opts.anchors.filtered_breakdown.card_path,
        button_path: opts.anchors.filtered_breakdown.button_path,
        pagination_dest: opts.anchors.filtered_breakdown.pagination_dest,
      }
      : undefined,
  };

  return {
    schema_version: 1,
    audit_type: "advanced",
    generated_at: new Date().toISOString(),
    source_filename: opts.source_filename,
    domain: opts.domain,
    url_count: rows.length,
    html_count: htmlCount,
    global_score,
    diagnostics,
    site_resources: opts.site_resources,
    sections,
    priorities,
    ai_summary: null,
    slides,
  };
}

// Backwards-helpful: count overall issues quickly.
export function countAllIssues(report: AdvReport): number {
  return report.sections.reduce(
    (s, sec) => s + sec.subcategories.reduce((acc, sub) => acc + sub.issues_full.length, 0),
    0,
  );
}
