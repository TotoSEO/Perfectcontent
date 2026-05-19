// Build the full advanced audit report from:
//  1. The parsed interne_html.csv rows
//  2. The parsed Issues ZIP (FR Bulk Export > Issues > All)
//  3. Optional anchor analysis from all_inlinks.csv
//  4. Optional site-level resources fetched server-side (robots.txt / sitemap.xml / llms.txt)
//
// The output is a slide-ready Report — one ordered list of slides + a list
// of subcategories that drive the XLSX export.

import { VBT } from "../brand";
import type { Severity } from "../types";
import type { InternalRow } from "./parse-internal";
import { findIssue, type ParsedIssue } from "./parse-issues";
import { DESC, SECTION_COVER } from "./descriptions";
import { recosForSection } from "./recommendations";
import type {
  AdvKPI,
  AdvSlide,
  AdvSection,
  AdvSubcategory,
  AdvReport,
  AdvIssueRow,
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

  const robotsExists = res?.robots_txt.fetched === true;
  const sitemapExists = res?.sitemap_xml.fetched === true;
  const sitemapRef = res?.robots_txt.has_sitemap_ref === true;
  const sitemapDuplicates = res?.sitemap_xml.duplicates || 0;
  const sitemapUrls = res?.sitemap_xml.url_count ?? null;

  const kpis: AdvKPI[] = [
    { label: "robots.txt", value: robotsExists ? "Présent" : "Absent", tone: robotsExists ? "ok" : "bad" },
    { label: "sitemap.xml", value: sitemapExists ? "Présent" : "Absent", tone: sitemapExists ? "ok" : "bad" },
    { label: "Sitemap dans robots", value: sitemapRef ? "Oui" : "Non", tone: sitemapRef ? "ok" : "warn" },
    { label: "URLs dans sitemap", value: sitemapUrls != null ? sitemapUrls.toLocaleString("fr-FR") : "—", tone: "info" },
    { label: "Doublons sitemap", value: sitemapDuplicates, tone: sitemapDuplicates > 0 ? "warn" : "ok" },
    { label: "Pages bloquées robots.txt", value: blockedCount, tone: blockedCount > 0 ? "warn" : "ok" },
  ];

  const issues: AdvIssueRow[] = [];
  if (!robotsExists) issues.push(toRow("/robots.txt", "high", { reason: "Fichier absent ou non-200 — créer un robots.txt à la racine" }));
  if (!sitemapExists) issues.push(toRow("/sitemap.xml", "high", { reason: "Sitemap absent ou non-200" }));
  if (robotsExists && !sitemapRef) issues.push(toRow("/robots.txt", "medium", { reason: "Sitemap non référencé via `Sitemap:` dans le robots.txt" }));
  if (sitemapDuplicates > 0) issues.push(toRow("/sitemap.xml", "medium", { reason: `${sitemapDuplicates} URLs dupliquées dans le sitemap` }));
  issues.push(...issueAsRows(blockedByRobots, "medium", () => ({ reason: "Bloquée par robots.txt" })));

  const sub: AdvSubcategory = {
    id: "robots_sitemap",
    label: "Robots.txt & sitemap",
    score: scoreFromRatio((!robotsExists ? 0.4 : 0) + (!sitemapExists ? 0.3 : 0) + (!sitemapRef && robotsExists ? 0.15 : 0) + (sitemapDuplicates > 0 ? 0.1 : 0)),
    issues_full: issues,
    columns: [{ key: "url", label: "URL", width: 60 }, { key: "reason", label: "Problème", width: 60 }],
    xlsx_sheet: "Robots & Sitemap",
  };

  const slide: AdvSlide = {
    kind: "data",
    section_id: "indexability_crawl",
    sub_id: "robots_sitemap",
    title: "Robots.txt & sitemap",
    description: DESC.robots_sitemap,
    kpis,
    xlsx_sheet: issues.length > 0 ? sub.xlsx_sheet : undefined,
    issues_count: issues.length,
    takeaway: !robotsExists || !sitemapExists
      ? "⚠️ Fichier(s) critique(s) manquant(s) — à créer en priorité."
      : (!sitemapRef ? "Référencer le sitemap dans le robots.txt — gain immédiat de découvrabilité." : "Fichiers en place ✓"),
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
  let missingCanon = 0, selfCanon = 0, crossCanon = 0;
  const noCanonRows: AdvIssueRow[] = [];
  for (const r of html.filter(isIndexable)) {
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
  const noindexIssue = findIssue(issues, "directive_noindex");
  const noindexRows = issueAsRows(noindexIssue, "high", (l) => ({
    indexability_status: l.extras["statut d indexabilite"] || l.extras["statut d'indexabilite"] || "noindex",
    inlinks: l.extras["liens entrants"] || l.extras.inlinks || "",
  }));
  const subNoindex: AdvSubcategory = {
    id: "noindex_pages",
    label: "Pages en noindex",
    score: scoreFromRatio(noindexRows.length / Math.max(html.length, 1)),
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
    description: "Les pages marquées en `noindex` ne sont pas indexées par Google. C'est parfois volontaire (panier, compte utilisateur, filtres), mais une page noindex qui reçoit des liens internes gaspille du budget crawl et du PageRank — soit la rendre indexable, soit retirer les liens internes pointant vers elle.",
    kpis: [
      { label: "URLs en noindex", value: noindexRows.length, tone: noindexRows.length > 0 ? "warn" : "ok" },
      { label: "% du site", value: html.length > 0 ? `${Math.round((noindexRows.length / html.length) * 100)} %` : "0 %", tone: noindexRows.length / Math.max(html.length, 1) > 0.05 ? "warn" : "ok" },
    ],
    xlsx_sheet: noindexRows.length > 0 ? subNoindex.xlsx_sheet : undefined,
    issues_count: noindexRows.length,
    takeaway: noindexRows.length === 0
      ? "Aucune page noindex détectée ✓"
      : `${noindexRows.length} page(s) noindex : vérifier qu'elles sont bien volontairement exclues.`,
  };

  // ----- LLMS.TXT (informational slide — analysis text only)
  const llmsFetched = res?.llms_txt.fetched === true;
  const slideLlms: AdvSlide = {
    kind: "info",
    section_id: "indexability_crawl",
    sub_id: "llms_txt",
    title: "Fichier llms.txt",
    description: DESC.llms_txt,
    facts: [
      { label: "Statut sur le site", value: llmsFetched ? "✓ Présent" : "✗ Absent" },
      { label: "Sites adopteurs", value: "+ 844 000" },
      { label: "Adopteurs notables", value: "Anthropic, Cloudflare, Stripe" },
    ],
    callout: {
      tone: "warn",
      title: "À prendre avec des pincettes",
      body: DESC.llms_txt_callout,
    },
  };

  // ----- Recommendations slide
  const slideReco: AdvSlide = {
    kind: "reco",
    section_id: "indexability_crawl",
    title: "Recommandations — Indexabilité & crawl",
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
    slides: [cover, slideRobots, slideDepth, slideHttp, slideHreflang, slideCanonical, slideNoindex, slideLlms, slideReco],
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
      heavyHtml.push(toRow(r.url, "critical", { html_size_kb: Math.round(kb), warning: "Au-delà de la limite Googlebot 2 Mo — risque de troncature" }));
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
      ? `${over2m} page(s) > 2 Mo : Googlebot risque de tronquer le contenu — à traiter en priorité.`
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
    title: "Recommandations — Performance",
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
  const html = rows.filter(isHtml).filter(isIndexable);

  // Compute basic counts on the spot (lengths, missing)
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
    title: "Recommandations — Balises & métadonnées",
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
    title: "Recommandations — Structure de contenu",
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

  // Internal linking overview: compute distributions on inlinks.
  let orphans = 0, low = 0, mid = 0, high = 0;
  const orphanRows: AdvIssueRow[] = [];
  for (const r of html) {
    const i = r.inlinks ?? 0;
    if (i === 0) {
      orphans++;
      orphanRows.push(toRow(r.url, "high", { inlinks: 0, outlinks: r.outlinks ?? 0, problem: "Page orpheline (0 lien entrant)" }));
    } else if (i < 3) {
      low++;
      orphanRows.push(toRow(r.url, "medium", { inlinks: i, outlinks: r.outlinks ?? 0, problem: "Sous-maillée (< 3 liens entrants)" }));
    } else if (i < 10) mid++;
    else high++;
  }
  let noOutlinks = 0;
  for (const r of html) {
    if ((r.outlinks ?? 0) === 0) {
      noOutlinks++;
      orphanRows.push(toRow(r.url, "low", { inlinks: r.inlinks ?? 0, outlinks: 0, problem: "Cul-de-sac (0 lien sortant)" }));
    }
  }
  const subOverview: AdvSubcategory = {
    id: "internal_linking_overview",
    label: "Maillage — vue d'ensemble",
    score: scoreFromRatio((orphans + low * 0.5 + noOutlinks * 0.2) / Math.max(html.length, 1)),
    issues_full: [],
    columns: [],
    xlsx_sheet: "Maillage — vue",
  };
  const slideOverview: AdvSlide = {
    kind: "data",
    section_id: "linking",
    sub_id: "internal_linking_overview",
    title: "Maillage interne",
    description: DESC.internal_linking,
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
        { label: "1-2", value: low, color: COLORS.warn },
        { label: "3-9", value: mid, color: COLORS.info },
        { label: "10+", value: high, color: COLORS.ok },
      ],
    },
    issues_count: 0,
  };

  // Broken links — two complementary sources:
  // 1. The Bulk Issues ZIP (codes_de_reponse_* CSVs) which lists pages of
  //    the user's own site returning 4xx/5xx.
  // 2. The Inlinks export, which lists every <a href> with its destination
  //    status code — catches both internal broken targets AND external
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
  // both sources report it.
  const seenDest = new Set(brokenIssues.map((r) => r.url));
  let internalCountFromInlinks = 0;
  let external4xxFromInlinks = 0;
  let external5xxFromInlinks = 0;
  if (anchors?.broken_links?.length) {
    for (const bl of anchors.broken_links) {
      if (bl.origin === "internal") internalCountFromInlinks++;
      else if (bl.status >= 500) external5xxFromInlinks++;
      else external4xxFromInlinks++;
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

  const internalTotal = (brokenInternal?.rows.length || 0) + internalCountFromInlinks;
  const external4xxTotal = (brokenExternal4xx?.rows.length || 0) + external4xxFromInlinks;
  const external5xxTotal = (brokenExternal5xx?.rows.length || 0) + external5xxFromInlinks;

  const subBroken: AdvSubcategory = {
    id: "broken_links",
    label: "Liens rompus",
    score: scoreFromRatio(brokenIssues.length / Math.max(rows.length, 1)),
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

  // Orphans / under-linked
  const subOrphans: AdvSubcategory = {
    id: "orphan_pages",
    label: "Pages orphelines",
    score: scoreFromRatio((orphans + low * 0.5) / Math.max(html.length, 1)),
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

  // Anchor analysis — anchors file (liens_entrants_tous.csv) is required in
  // the advanced flow; we still keep a placeholder branch for legacy audits
  // that pre-date this requirement.
  const slidesAnchor: AdvSlide[] = [];
  const subAnchor: AdvSubcategory[] = [];
  if (anchors) {
    const topConc = pickTopConcentratedDestinations(anchors.by_destination, 5, 6);
    const worst = pickWorstDestinations(anchors.by_destination, 10, 15);
    // Build anchor rows for XLSX (one row per link)
    const anchorAllRows: AdvIssueRow[] = anchors.rows.map((r) => ({
      url: r.destination,
      severity: r.is_empty ? "medium" : r.is_generic ? "low" : "info",
      source: r.source,
      anchor: r.anchor || "(vide)",
      position: r.position || "—",
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
      xlsx_sheet: "Ancres — par lien",
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
      xlsx_sheet: "Ancres — par destination",
    };
    subAnchor.push(subAnchors, subAnchorsDest);

    slidesAnchor.push({
      kind: "anchor-bars",
      section_id: "linking",
      sub_id: "anchors_overview",
      title: "Texte des ancres — ancres dominantes",
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
      xlsx_sheet: "Ancres — par lien",
      issues_count: anchorAllRows.length,
    });

    slidesAnchor.push({
      kind: "anchor-table",
      section_id: "linking",
      sub_id: "anchors_diversity",
      title: "Texte des ancres — score de diversité",
      description: DESC.anchor_table,
      rows: worst.slice(0, 8),
      xlsx_sheet: "Ancres — par destination",
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
    title: "Recommandations — Maillage interne",
    groups: recosForSection("linking"),
  };

  const subcategories = [subOverview, subBroken, subOrphans, ...subAnchor];
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
    slides: [cover, slideOverview, slideBroken, slideOrphans, ...slidesAnchor, reco],
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
  // that uses the image) pair instead of one row per unique image — so a
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
    ],
    xlsx_sheet: altRows.length > 0 ? subAlt.xlsx_sheet : undefined,
    issues_count: altRows.length,
  };

  // Size attrs (width/height missing) — dedupe per unique image URL,
  // see comment on altRows above.
  const sizeAttrRows = dedupByUrl(issueAsRows(sizeMissing, "medium", () => ({ problem: "Attributs largeur/hauteur manquants (impact CLS)" })));
  const subSize: AdvSubcategory = {
    id: "image_size_attr",
    label: "Images sans width/height",
    score: scoreFromRatio(sizeAttrRows.length / Math.max(imagesList.length, 1)),
    issues_full: sizeAttrRows,
    columns: [
      { key: "problem", label: "Problème", width: 50 },
      { key: "url", label: "URL image", width: 60 },
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
      { label: "Images concernées", value: sizeAttrRows.length, tone: sizeAttrRows.length > 0 ? "warn" : "ok" },
      { label: "Impact CLS", value: sizeAttrRows.length > 0 ? "Élevé" : "Faible", tone: sizeAttrRows.length > 0 ? "bad" : "ok" },
    ],
    xlsx_sheet: sizeAttrRows.length > 0 ? subSize.xlsx_sheet : undefined,
    issues_count: sizeAttrRows.length,
  };

  // Weight — driven by images_tous.csv when available (full distribution),
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

  const cover: AdvSlide = {
    kind: "section-cover",
    section_id: "images",
    title: SECTION_COVER.images.title,
    eyebrow: "Partie 6 / 6",
    icon: SECTION_COVER.images.icon,
    bullets: SECTION_COVER.images.bullets,
  };
  const reco: AdvSlide = {
    kind: "reco",
    section_id: "images",
    title: "Recommandations — Images",
    groups: recosForSection("images"),
  };

  const subcategories = [subAlt, subSize, subWeight];
  const sectionScore = Math.round(subcategories.reduce((s, c) => s + c.score, 0) / subcategories.length);
  const section: AdvSection = {
    id: "images",
    label: "Images",
    score: sectionScore,
    weight: 10,
    summary: `${imagesList.length.toLocaleString("fr-FR")} images · ${altRows.length} sans alt · ${sizeAttrRows.length} sans dimensions · ${heavyCount + veryHeavy} > 100 Ko`,
    subcategories,
  };
  return { section, slides: [cover, slideAlt, slideSize, slideWeight, reco] };
}

// ---------- Priorities -----------------------------------------------------

const SECTION_WEIGHT_FOR_PRIORITY: Record<string, number> = {
  indexability_crawl: 1.2,
  performance: 1.0,
  meta: 0.9,
  structure: 0.7,
  linking: 1.1,
  images: 0.7,
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
  orphan_pages: "medium",
  anchors_links: "deep",
  anchors_destinations: "deep",
  image_alt: "medium",
  image_size_attr: "quick-win",
  image_weight: "medium",
};

function buildPriorities(sections: AdvSection[]): PriorityItem[] {
  const items: PriorityItem[] = [];
  for (const sec of sections) {
    const secWeight = SECTION_WEIGHT_FOR_PRIORITY[sec.id] || 1;
    for (const sub of sec.subcategories) {
      if (sub.issues_full.length === 0) continue;
      // Aggregate severity counts
      const sevCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const r of sub.issues_full) sevCount[r.severity]++;
      // Score: severity-weighted volume × section impact
      const rawScore = (
        sevCount.critical * SEV_WEIGHT.critical +
        sevCount.high * SEV_WEIGHT.high +
        sevCount.medium * SEV_WEIGHT.medium +
        sevCount.low * SEV_WEIGHT.low
      ) * secWeight;
      const urgency: PriorityItem["urgency"] =
        sevCount.critical > 0 ? "critical"
          : sevCount.high > 5 ? "high"
            : sevCount.high > 0 || sevCount.medium > 10 ? "medium"
              : "low";
      const effort = SUB_EFFORT[sub.id] || "medium";
      const impact: PriorityItem["impact"] = secWeight >= 1.1 ? "high" : secWeight >= 0.9 ? "medium" : "low";
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
  return items.slice(0, 12); // Top 12 priorities — fits in 1-2 slides cleanly
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

  const sections = [secIdx, secPerf, secMeta, secStruct, secLink, secImg];
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
    prioritySlide,
  ];

  return {
    schema_version: 1,
    audit_type: "advanced",
    generated_at: new Date().toISOString(),
    source_filename: opts.source_filename,
    domain: opts.domain,
    url_count: rows.length,
    html_count: htmlCount,
    global_score,
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
