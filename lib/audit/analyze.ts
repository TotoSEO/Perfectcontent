// Compute the full audit report from parsed UrlRow[]. Each category has its
// own check function returning a CategoryReport. The orchestrator at the
// bottom assembles them and computes the global score.

import type { UrlRow } from "./parse";
import type { InlinksMap } from "./inlinks";
import { VBT } from "./brand";
import type { CategoryReport, IssueRow, Report, Severity } from "./types";

// Palette aligned to Visibili'tea brand (terracotta / amber / brick).
const COLORS = {
  ok: VBT.good,            // sage green that fits the warm palette
  warn: VBT.amber500,      // amber 500
  bad: VBT.brick500,       // brick 500
  info: VBT.terracotta500, // terracotta 500
  muted: VBT.paperEdge,    // warm paper edge
};

// ---------- helpers --------------------------------------------------------

const isHtml = (r: UrlRow) => r.content_type !== null && /text\/html/i.test(r.content_type);
const isIndexable = (r: UrlRow) => /^indexable$/i.test((r.indexability || "").trim());

// Cell-value matchers that also work on French Screaming Frog exports.
const RE_NOINDEX   = /noindex|no.?index|non.?index/i;
const RE_CANON     = /canonical|canonis[eé]e?|canonique/i;
const RE_ROBOTS    = /robots|bloqu[eé]/i;

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

function severityCount(rows: IssueRow[]): { critical: number; high: number; medium: number; low: number } {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of rows) {
    if (r.severity === "critical") out.critical++;
    else if (r.severity === "high") out.high++;
    else if (r.severity === "medium") out.medium++;
    else if (r.severity === "low") out.low++;
  }
  return out;
}

function scoreFromRatio(badRatio: number, weight = 1): number {
  // 0% bad -> 100, 100% bad -> 0, weighted curve so small ratios already cost
  const r = Math.max(0, Math.min(1, badRatio));
  const linear = 100 * (1 - r);
  return Math.round(Math.max(0, Math.min(100, linear)));
}

function topN<T>(arr: T[], n = 50): T[] {
  return arr.slice(0, n);
}

// ---------- category builders ---------------------------------------------

function checkHttp(rows: UrlRow[]): CategoryReport {
  const all = rows.length;
  let s2 = 0, s3 = 0, s4 = 0, s5 = 0, sUnknown = 0;
  const issues: IssueRow[] = [];
  for (const r of rows) {
    const c = r.status_code;
    if (c === null) { sUnknown++; continue; }
    if (c >= 200 && c < 300) s2++;
    else if (c >= 300 && c < 400) {
      s3++;
      issues.push({
        url: r.url,
        severity: c === 302 ? "high" : "medium",
        status_code: c,
        status: r.status,
        redirect_url: r.redirect_url,
      });
    } else if (c >= 400 && c < 500) {
      s4++;
      issues.push({
        url: r.url,
        severity: "critical",
        status_code: c,
        status: r.status,
      });
    } else if (c >= 500) {
      s5++;
      issues.push({ url: r.url, severity: "critical", status_code: c, status: r.status });
    }
  }
  const broken = s4 + s5;
  const score = scoreFromRatio((broken * 1 + s3 * 0.3) / Math.max(all, 1));
  return {
    id: "http",
    label: "Réponses HTTP",
    score,
    weight: 18,
    summary: `${s4 + s5} URLs cassées · ${s3} redirections internes · ${s2} OK.`,
    kpis: [
      { label: "200 OK",   value: s2, tone: "ok" },
      { label: "3xx",      value: s3, tone: s3 > 0 ? "warn" : "ok" },
      { label: "4xx",      value: s4, tone: s4 > 0 ? "bad" : "ok" },
      { label: "5xx",      value: s5, tone: s5 > 0 ? "bad" : "ok" },
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
    columns: [
      { key: "status_code", label: "Code" },
      { key: "status", label: "Status" },
      { key: "redirect_url", label: "Redirige vers" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues.sort((a, b) => Number(b.status_code) - Number(a.status_code)), 15),
    issues_full: issues,
  };
}

function checkIndexability(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml);
  const indexable = html.filter(isIndexable).length;
  const noindex = html.filter((r) => RE_NOINDEX.test(r.indexability_status || "")).length;
  const blocked = html.filter((r) => RE_ROBOTS.test(r.indexability_status || "")).length;
  const canonicalized = html.filter((r) => RE_CANON.test(r.indexability_status || "")).length;
  const issues: IssueRow[] = [];
  for (const r of html) {
    if (isIndexable(r)) continue;
    const reason = r.indexability_status || "Unknown";
    issues.push({
      url: r.url,
      severity: (r.inlinks || 0) > 0 ? "high" : "low",
      reason,
      inlinks: r.inlinks ?? 0,
    });
  }
  const total = html.length || 1;
  const noindexWithLinks = issues.filter((i) => Number(i.inlinks) > 0 && RE_NOINDEX.test(String(i.reason))).length;
  const score = scoreFromRatio(noindexWithLinks / total);
  return {
    id: "indexability",
    label: "Indexabilité",
    score,
    weight: 15,
    summary: `${indexable} indexables · ${noindex} noindex · ${blocked} bloquées robots.txt · ${noindexWithLinks} noindex avec liens entrants (à fixer).`,
    kpis: [
      { label: "Indexables", value: indexable, tone: "ok" },
      { label: "Noindex", value: noindex, tone: noindex > 0 ? "warn" : "ok" },
      { label: "Robots-blocked", value: blocked, tone: blocked > 0 ? "warn" : "ok" },
      { label: "Canonicalisées", value: canonicalized, tone: canonicalized > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "donut",
      segments: [
        { label: "Indexable", value: indexable, color: COLORS.ok },
        { label: "Noindex", value: noindex, color: COLORS.warn },
        { label: "Bloquée", value: blocked, color: COLORS.bad },
        { label: "Canon.", value: canonicalized, color: COLORS.info },
      ].filter((s) => s.value > 0),
    },
    columns: [
      { key: "reason", label: "Raison" },
      { key: "inlinks", label: "Inlinks" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues.sort((a, b) => Number(b.inlinks) - Number(a.inlinks)), 15),
    issues_full: issues,
  };
}

function checkTitles(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml).filter(isIndexable);
  const issues: IssueRow[] = [];
  const seen = new Map<string, number>();
  for (const r of html) {
    const t = (r.title || "").trim();
    if (t) seen.set(t.toLowerCase(), (seen.get(t.toLowerCase()) ?? 0) + 1);
  }
  let missing = 0, tooLong = 0, tooShort = 0, dup = 0;
  for (const r of html) {
    const t = (r.title || "").trim();
    const len = r.title_length ?? t.length;
    if (!t) {
      missing++;
      issues.push({ url: r.url, severity: "high", reason: "manquant", title: "", length: 0 });
      continue;
    }
    const dupCount = seen.get(t.toLowerCase()) ?? 0;
    if (dupCount > 1) {
      dup++;
      issues.push({ url: r.url, severity: "high", reason: `dupliqué (×${dupCount})`, title: t, length: len });
    } else if (len > 60) {
      tooLong++;
      issues.push({ url: r.url, severity: "medium", reason: `trop long (${len} car.)`, title: t, length: len });
    } else if (len < 30) {
      tooShort++;
      issues.push({ url: r.url, severity: "low", reason: `trop court (${len} car.)`, title: t, length: len });
    }
  }
  const total = html.length || 1;
  const score = scoreFromRatio((missing * 1 + dup * 0.8 + tooLong * 0.3 + tooShort * 0.2) / total);
  return {
    id: "titles",
    label: "Titles",
    score,
    weight: 10,
    summary: `${missing} manquants · ${dup} dupliqués · ${tooLong} trop longs · ${tooShort} trop courts.`,
    kpis: [
      { label: "Manquants", value: missing, tone: missing > 0 ? "bad" : "ok" },
      { label: "Dupliqués", value: dup, tone: dup > 0 ? "bad" : "ok" },
      { label: "Trop longs", value: tooLong, tone: tooLong > 0 ? "warn" : "ok" },
      { label: "Trop courts", value: tooShort, tone: tooShort > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "Manquants", value: missing, color: COLORS.bad },
        { label: "Dupliqués", value: dup, color: COLORS.bad },
        { label: "Trop longs", value: tooLong, color: COLORS.warn },
        { label: "Trop courts", value: tooShort, color: COLORS.warn },
      ],
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "length", label: "Longueur" },
      { key: "title", label: "Title" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkMeta(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml).filter(isIndexable);
  const issues: IssueRow[] = [];
  const seen = new Map<string, number>();
  for (const r of html) {
    const m = (r.meta_description || "").trim();
    if (m) seen.set(m.toLowerCase(), (seen.get(m.toLowerCase()) ?? 0) + 1);
  }
  let missing = 0, tooLong = 0, tooShort = 0, dup = 0;
  for (const r of html) {
    const m = (r.meta_description || "").trim();
    const len = r.meta_description_length ?? m.length;
    if (!m) {
      missing++;
      issues.push({ url: r.url, severity: "medium", reason: "manquante", meta: "", length: 0 });
      continue;
    }
    const c = seen.get(m.toLowerCase()) ?? 0;
    if (c > 1) {
      dup++;
      issues.push({ url: r.url, severity: "high", reason: `dupliquée (×${c})`, meta: m, length: len });
    } else if (len > 160) {
      tooLong++;
      issues.push({ url: r.url, severity: "low", reason: `trop longue (${len} car.)`, meta: m, length: len });
    } else if (len < 70) {
      tooShort++;
      issues.push({ url: r.url, severity: "low", reason: `trop courte (${len} car.)`, meta: m, length: len });
    }
  }
  const total = html.length || 1;
  const score = scoreFromRatio((missing * 0.6 + dup * 0.8 + tooLong * 0.2 + tooShort * 0.2) / total);
  return {
    id: "meta",
    label: "Meta descriptions",
    score,
    weight: 8,
    summary: `${missing} manquantes · ${dup} dupliquées · ${tooLong} trop longues · ${tooShort} trop courtes.`,
    kpis: [
      { label: "Manquantes", value: missing, tone: missing > 0 ? "warn" : "ok" },
      { label: "Dupliquées", value: dup, tone: dup > 0 ? "bad" : "ok" },
      { label: "Trop longues", value: tooLong, tone: tooLong > 0 ? "warn" : "ok" },
      { label: "Trop courtes", value: tooShort, tone: tooShort > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "Manquantes", value: missing, color: COLORS.warn },
        { label: "Dupliquées", value: dup, color: COLORS.bad },
        { label: "Trop longues", value: tooLong, color: COLORS.warn },
        { label: "Trop courtes", value: tooShort, color: COLORS.warn },
      ],
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "length", label: "Long." },
      { key: "meta", label: "Meta" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkH1(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml).filter(isIndexable);
  const issues: IssueRow[] = [];
  const seen = new Map<string, number>();
  for (const r of html) {
    const h = (r.h1 || "").trim();
    if (h) seen.set(h.toLowerCase(), (seen.get(h.toLowerCase()) ?? 0) + 1);
  }
  let missing = 0, multiple = 0, dup = 0;
  for (const r of html) {
    const h = (r.h1 || "").trim();
    if (!h) {
      missing++;
      issues.push({ url: r.url, severity: "high", reason: "manquant", h1: "" });
      continue;
    }
    if (r.h1_2 && r.h1_2.trim()) {
      multiple++;
      issues.push({ url: r.url, severity: "medium", reason: "multiples (>1 H1)", h1: h, h1_2: r.h1_2 });
    }
    const c = seen.get(h.toLowerCase()) ?? 0;
    if (c > 1) {
      dup++;
      issues.push({ url: r.url, severity: "medium", reason: `dupliqué (×${c})`, h1: h });
    }
  }
  const total = html.length || 1;
  const score = scoreFromRatio((missing * 1 + multiple * 0.4 + dup * 0.4) / total);
  return {
    id: "h1",
    label: "H1",
    score,
    weight: 8,
    summary: `${missing} manquants · ${multiple} pages avec >1 H1 · ${dup} dupliqués.`,
    kpis: [
      { label: "Manquants", value: missing, tone: missing > 0 ? "bad" : "ok" },
      { label: "Multiples", value: multiple, tone: multiple > 0 ? "warn" : "ok" },
      { label: "Dupliqués", value: dup, tone: dup > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "Manquants", value: missing, color: COLORS.bad },
        { label: "Multiples", value: multiple, color: COLORS.warn },
        { label: "Dupliqués", value: dup, color: COLORS.warn },
      ],
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "h1", label: "H1" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkDepth(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml).filter(isIndexable);
  const bins: Record<number, number> = {};
  let max = 0;
  for (const r of html) {
    const d = r.crawl_depth ?? -1;
    bins[d] = (bins[d] ?? 0) + 1;
    if (d > max) max = d;
  }
  const issues: IssueRow[] = [];
  for (const r of html) {
    if ((r.crawl_depth ?? 0) >= 5) {
      issues.push({
        url: r.url,
        severity: (r.crawl_depth ?? 0) >= 7 ? "high" : "medium",
        depth: r.crawl_depth,
        inlinks: r.inlinks,
      });
    }
  }
  const tooDeep = issues.length;
  const total = html.length || 1;
  const score = scoreFromRatio(tooDeep / total);
  const histogramKeys = Array.from({ length: max + 1 }, (_, i) => i);
  return {
    id: "depth",
    label: "Profondeur",
    score,
    weight: 8,
    summary: `${tooDeep} pages au-delà de la profondeur 4 (à raccourcir via le maillage).`,
    kpis: [
      { label: "Profondeur max", value: max, tone: max > 5 ? "bad" : "ok" },
      { label: "Pages > depth 4", value: tooDeep, tone: tooDeep > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "histogram",
      bins: histogramKeys.map((k) => ({ label: `D${k}`, value: bins[k] ?? 0 })),
    },
    columns: [
      { key: "depth", label: "Profondeur" },
      { key: "inlinks", label: "Inlinks" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues.sort((a, b) => Number(b.depth) - Number(a.depth)), 15),
    issues_full: issues,
  };
}

function checkLinking(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml).filter(isIndexable);
  const orphans = html.filter((r) => (r.inlinks ?? 0) === 0);
  const noOutlinks = html.filter((r) => (r.outlinks ?? 0) === 0);
  const issues: IssueRow[] = [];
  for (const r of orphans) {
    issues.push({ url: r.url, severity: "high", reason: "page orpheline (0 inlinks)", inlinks: 0, outlinks: r.outlinks });
  }
  for (const r of noOutlinks) {
    issues.push({ url: r.url, severity: "low", reason: "0 outlinks (cul-de-sac)", inlinks: r.inlinks, outlinks: 0 });
  }
  const total = html.length || 1;
  const score = scoreFromRatio((orphans.length * 1 + noOutlinks.length * 0.2) / total);
  // Top pages by inlinks for the "PageRank interne" signal
  const top = [...html].sort((a, b) => (b.inlinks ?? 0) - (a.inlinks ?? 0)).slice(0, 10);
  return {
    id: "linking",
    label: "Maillage interne",
    score,
    weight: 10,
    summary: `${orphans.length} pages orphelines · ${noOutlinks.length} pages sans lien sortant.`,
    kpis: [
      { label: "Orphelines", value: orphans.length, tone: orphans.length > 0 ? "bad" : "ok" },
      { label: "0 outlinks", value: noOutlinks.length, tone: noOutlinks.length > 0 ? "warn" : "ok" },
      { label: "Top inlinks", value: top[0]?.inlinks ?? 0, tone: "ok" },
    ],
    chart: {
      type: "bar",
      bars: top.slice(0, 8).map((p) => ({
        label: shortUrl(p.url),
        value: p.inlinks ?? 0,
        color: COLORS.info,
      })),
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "inlinks", label: "Inlinks" },
      { key: "outlinks", label: "Outlinks" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkCanonicals(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml);
  const issues: IssueRow[] = [];
  let crossCanon = 0, selfCanon = 0, missingCanon = 0, toHomepage = 0;
  let homepage: string | null = null;
  // Heuristic: the URL with depth 0 is the homepage
  for (const r of html) if (r.crawl_depth === 0) { homepage = r.url; break; }
  for (const r of html) {
    const c = (r.canonical || "").trim();
    if (!c) { missingCanon++; continue; }
    if (c === r.url) { selfCanon++; continue; }
    crossCanon++;
    let sev: Severity = "medium";
    let reason = "canonical différent de l'URL";
    if (homepage && c === homepage) {
      toHomepage++;
      sev = "high";
      reason = "canonical vers la home";
    }
    issues.push({ url: r.url, severity: sev, reason, canonical: c });
  }
  const total = html.length || 1;
  const score = scoreFromRatio((toHomepage * 1 + crossCanon * 0.2 + missingCanon * 0.1) / total);
  return {
    id: "canonicals",
    label: "Canonicals",
    score,
    weight: 8,
    summary: `${selfCanon} self-canonical · ${crossCanon} cross-canonical · ${toHomepage} pointent vers la home (red flag).`,
    kpis: [
      { label: "Self", value: selfCanon, tone: "ok" },
      { label: "Cross", value: crossCanon, tone: crossCanon > 0 ? "warn" : "ok" },
      { label: "→ Home", value: toHomepage, tone: toHomepage > 0 ? "bad" : "ok" },
      { label: "Manquantes", value: missingCanon, tone: missingCanon > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "donut",
      segments: [
        { label: "Self", value: selfCanon, color: COLORS.ok },
        { label: "Cross", value: crossCanon, color: COLORS.warn },
        { label: "→ Home", value: toHomepage, color: COLORS.bad },
        { label: "Aucune", value: missingCanon, color: COLORS.muted },
      ].filter((s) => s.value > 0),
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "canonical", label: "Canonical" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkUrls(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml);
  const issues: IssueRow[] = [];
  let long = 0, params = 0, https = 0, http = 0;
  for (const r of html) {
    if (r.url.startsWith("https://")) https++;
    else if (r.url.startsWith("http://")) {
      http++;
      issues.push({ url: r.url, severity: "high", reason: "URL en HTTP" });
    }
    if (r.url.length > 100) {
      long++;
      issues.push({ url: r.url, severity: "low", reason: `URL trop longue (${r.url.length} car.)`, length: r.url.length });
    }
    if (r.url.includes("?")) {
      params++;
      issues.push({ url: r.url, severity: "low", reason: "query string dans l'URL" });
    }
  }
  const total = html.length || 1;
  const score = scoreFromRatio((http * 1 + long * 0.3 + params * 0.1) / total);
  return {
    id: "urls",
    label: "URLs",
    score,
    weight: 6,
    summary: `${http} en HTTP · ${long} URLs > 100 car. · ${params} avec query string.`,
    kpis: [
      { label: "HTTPS", value: https, tone: "ok" },
      { label: "HTTP", value: http, tone: http > 0 ? "bad" : "ok" },
      { label: "Trop longues", value: long, tone: long > 0 ? "warn" : "ok" },
      { label: "Query string", value: params, tone: params > 0 ? "warn" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "HTTPS", value: https, color: COLORS.ok },
        { label: "HTTP", value: http, color: COLORS.bad },
        { label: "> 100 car.", value: long, color: COLORS.warn },
        { label: "?param=", value: params, color: COLORS.warn },
      ],
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "length", label: "Longueur" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkContent(rows: UrlRow[]): CategoryReport {
  const html = rows.filter(isHtml).filter(isIndexable);
  const issues: IssueRow[] = [];
  let thin = 0, fat = 0;
  for (const r of html) {
    const w = r.word_count ?? 0;
    if (w > 0 && w < 200) {
      thin++;
      issues.push({ url: r.url, severity: "medium", reason: "contenu trop léger", word_count: w });
    }
    if (w > 4000) {
      fat++;
      issues.push({ url: r.url, severity: "low", reason: "contenu très long", word_count: w });
    }
  }
  const total = html.length || 1;
  const score = scoreFromRatio((thin * 0.5) / total);
  return {
    id: "content",
    label: "Volume de contenu",
    score,
    weight: 5,
    summary: `${thin} pages < 200 mots · ${fat} pages > 4000 mots.`,
    kpis: [
      { label: "< 200 mots", value: thin, tone: thin > 0 ? "warn" : "ok" },
      { label: "> 4000 mots", value: fat, tone: "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "< 200 mots", value: thin, color: COLORS.warn },
        { label: "> 4000 mots", value: fat, color: COLORS.info },
      ],
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "word_count", label: "Mots" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(issues, 15),
    issues_full: issues,
  };
}

function checkImages(rows: UrlRow[]): CategoryReport {
  const images = rows.filter(
    (r) => r.content_type !== null && /^image\//i.test(r.content_type),
  );
  const issues: IssueRow[] = [];
  let heavy = 0; // > 500 KB
  let veryHeavy = 0; // > 1 MB
  let broken = 0; // 4xx / 5xx
  let totalKb = 0;
  for (const img of images) {
    const sizeKb = img.size_bytes != null ? img.size_bytes / 1024 : 0;
    totalKb += sizeKb;
    if ((img.status_code ?? 0) >= 400) {
      broken++;
      issues.push({
        url: img.url,
        severity: "critical",
        reason: `image cassée (${img.status_code})`,
        size_kb: Math.round(sizeKb),
        status_code: img.status_code,
      });
      continue;
    }
    if (sizeKb >= 1024) {
      veryHeavy++;
      issues.push({
        url: img.url,
        severity: "high",
        reason: `image très lourde`,
        size_kb: Math.round(sizeKb),
        format: extractFormat(img.url, img.content_type),
      });
    } else if (sizeKb >= 500) {
      heavy++;
      issues.push({
        url: img.url,
        severity: "medium",
        reason: `image lourde`,
        size_kb: Math.round(sizeKb),
        format: extractFormat(img.url, img.content_type),
      });
    }
  }
  const total = images.length || 1;
  const score = scoreFromRatio((veryHeavy * 1 + heavy * 0.4 + broken * 1) / total);
  const avgKb = images.length ? totalKb / images.length : 0;
  return {
    id: "images",
    label: "Images",
    score,
    weight: 6,
    summary: `${images.length} images crawlées · ${broken} cassées · ${heavy + veryHeavy} > 500 Ko (dont ${veryHeavy} > 1 Mo).`,
    kpis: [
      { label: "Total images", value: images.length, tone: "ok" },
      { label: "Cassées", value: broken, tone: broken > 0 ? "bad" : "ok" },
      { label: "> 500 Ko", value: heavy + veryHeavy, tone: heavy + veryHeavy > 0 ? "warn" : "ok" },
      { label: "Poids moyen", value: `${Math.round(avgKb)} Ko`, tone: avgKb > 200 ? "warn" : "ok" },
    ],
    chart: {
      type: "bar",
      bars: [
        { label: "< 500 Ko", value: Math.max(0, images.length - heavy - veryHeavy - broken), color: COLORS.ok },
        { label: "500 Ko – 1 Mo", value: heavy, color: COLORS.warn },
        { label: "> 1 Mo", value: veryHeavy, color: COLORS.bad },
        { label: "Cassées", value: broken, color: COLORS.bad },
      ],
    },
    columns: [
      { key: "reason", label: "Problème" },
      { key: "size_kb", label: "Poids (Ko)" },
      { key: "format", label: "Format" },
      { key: "url", label: "URL" },
    ],
    top_issues: topN(
      issues.sort((a, b) => Number(b.size_kb || 0) - Number(a.size_kb || 0)),
      15,
    ),
    issues_full: issues,
  };
}

function extractFormat(url: string, contentType: string | null): string {
  if (contentType) {
    const m = contentType.match(/^image\/([a-z0-9.+-]+)/i);
    if (m) return m[1].toLowerCase();
  }
  const ext = url.split("?")[0].split("#")[0].split(".").pop() || "";
  return ext.length <= 5 ? ext.toLowerCase() : "—";
}


// ---------- orchestrator ---------------------------------------------------

export function analyze(
  rows: UrlRow[],
  opts: {
    source_filename: string | null;
    contextual_inlinks?: InlinksMap;
    contextual_inlinks_label?: string;
  },
): Report {
  // If the user provided an `all_inlinks.csv` Bulk Export, replace the
  // default Screaming Frog inlinks (which include nav/footer/header) with
  // only the Body / Content links. This kills the "all pages have 50+ inlinks
  // because of the footer" effect and surfaces real orphan / under-linked
  // pages.
  let workingRows = rows;
  if (opts.contextual_inlinks) {
    const map = opts.contextual_inlinks;
    workingRows = rows.map((r) => ({
      ...r,
      inlinks: map.get(r.url) ?? 0,
      unique_inlinks: map.get(r.url) ?? 0,
    }));
  }

  const cats: CategoryReport[] = [
    checkHttp(workingRows),
    checkIndexability(workingRows),
    checkTitles(workingRows),
    checkMeta(workingRows),
    checkH1(workingRows),
    checkDepth(workingRows),
    checkLinking(workingRows),
    checkCanonicals(workingRows),
    checkImages(workingRows),
    checkUrls(workingRows),
    checkContent(workingRows),
  ];
  const totalWeight = cats.reduce((s, c) => s + c.weight, 0);
  const weightedSum = cats.reduce((s, c) => s + c.score * c.weight, 0);
  const global_score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_filename: opts.source_filename,
    url_count: rows.length,
    crawl_date: null,
    global_score,
    categories: cats,
  };
}

function shortUrl(u: string): string {
  try {
    const p = new URL(u);
    return (p.hostname.replace(/^www\./, "") + p.pathname).slice(0, 32);
  } catch {
    return u.slice(0, 32);
  }
}
