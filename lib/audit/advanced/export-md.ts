// Markdown export of the advanced audit.
//
// Why Markdown ? Built for handoff to ANOTHER AI (Claude, GPT…) for a
// review pass : "is this audit consistent ? is anything off ?". LLMs read
// Markdown natively and it's compact, hierarchical, lossless on the
// slide content side. Far more reliable than rasterising 50 slides into
// a PDF.
//
// The output is one .md file containing :
//   1. Header (audit name, domain, generated_at, perimeter)
//   2. Global score + section-by-section breakdown with weights
//   3. Diagnostics block (exclusions, sample sizes)
//   4. For each section : every slide it carries (title, description,
//      KPIs, takeaway, top issue rows)
//   5. Priority list (Top 12) and AI summaries when present

import type {
  AdvReport,
  AdvSlide,
  AdvKPI,
  AdvIssueRow,
  PriorityItem,
} from "./types";

const MAX_ISSUE_ROWS_PER_CAT = 20;

function downloadString(content: string, filename: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function kpiLine(k: AdvKPI): string {
  const tone = k.tone ? ` _(${k.tone})_` : "";
  return `- **${k.label}** : ${k.value}${tone}`;
}

function row(r: AdvIssueRow, cols: { key: string; label: string }[]): string {
  return cols.map((c) => {
    const v = r[c.key];
    if (v === undefined || v === null || v === "") return "";
    return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  }).join(" | ");
}

function issueTable(
  rows: AdvIssueRow[],
  columns: { key: string; label: string }[],
): string {
  if (rows.length === 0) return "_(aucune ligne)_";
  const visible = rows.slice(0, MAX_ISSUE_ROWS_PER_CAT);
  const head = ["Sévérité", ...columns.map((c) => c.label)].join(" | ");
  const sep = ["---", ...columns.map(() => "---")].join(" | ");
  const body = visible.map((r) => {
    const sev = String(r.severity || "");
    return `${sev} | ${row(r, columns)}`;
  }).join("\n");
  const more = rows.length > MAX_ISSUE_ROWS_PER_CAT
    ? `\n\n_+ ${rows.length - MAX_ISSUE_ROWS_PER_CAT} autres lignes (cap à ${MAX_ISSUE_ROWS_PER_CAT})._`
    : "";
  return `| ${head} |\n| ${sep} |\n${body.split("\n").map((l) => `| ${l} |`).join("\n")}${more}`;
}

function slideToMd(slide: AdvSlide): string {
  const lines: string[] = [];
  switch (slide.kind) {
    case "cover":
      return [
        `## Couverture`,
        `- URLs analysées : ${slide.url_count.toLocaleString("fr-FR")}`,
        `- Catégories : ${slide.sections_count}`,
        `- Problèmes détectés : ${slide.issues_count.toLocaleString("fr-FR")}`,
      ].join("\n");

    case "synthesis-radar":
      lines.push(`## Synthèse`, "", `**Score global : ${slide.global_score}/100**`, "");
      if (slide.ai_intro) lines.push(slide.ai_intro, "");
      if (slide.ai_best.length) lines.push(`- **Mieux notées** : ${slide.ai_best.join(" · ")}`);
      if (slide.ai_worst.length) lines.push(`- **Plus faibles** : ${slide.ai_worst.join(" · ")}`);
      lines.push("", "| Catégorie | Score | Poids |", "| --- | --- | --- |");
      for (const s of slide.sections) {
        lines.push(`| ${s.label} | ${s.score}/100 | ${s.weight} |`);
      }
      return lines.join("\n");

    case "summary":
      lines.push(`## Synthèse (legacy)`, "", `**Score global : ${slide.global_score}/100**`, "");
      lines.push("| Catégorie | Score | Poids | Résumé |", "| --- | --- | --- | --- |");
      for (const s of slide.sections) {
        lines.push(`| ${s.label} | ${s.score}/100 | ${s.weight} | ${s.summary.replace(/\|/g, "\\|")} |`);
      }
      return lines.join("\n");

    case "section-cover":
      return [
        `## ▶ ${slide.title}`,
        ``,
        `_${slide.eyebrow}_`,
        ``,
        ...slide.bullets.map((b) => `- ${b}`),
      ].join("\n");

    case "data":
      lines.push(`### ${slide.title}`);
      if (slide.description) lines.push("", slide.description);
      if (slide.kpis.length) {
        lines.push("", "**KPIs :**");
        for (const k of slide.kpis) lines.push(kpiLine(k));
      }
      if (slide.chart) {
        const c = slide.chart;
        if (c.type === "donut" || c.type === "bar") {
          const segs = c.type === "donut" ? c.segments : c.bars;
          lines.push("", `**Distribution (${c.type}) :**`);
          for (const s of segs) lines.push(`- ${s.label} : ${s.value}`);
        } else if (c.type === "histogram") {
          lines.push("", `**Histogramme :** ${c.bins.map((b) => `${b.label}=${b.value}`).join(", ")}`);
        }
      }
      if (slide.takeaway) lines.push("", `> 💡 ${slide.takeaway}`);
      if (slide.issues_count > 0) lines.push("", `_${slide.issues_count} problème(s) détecté(s)._`);
      return lines.join("\n");

    case "info":
      lines.push(`### ${slide.title}`);
      if (slide.description) lines.push("", slide.description);
      if (slide.facts && slide.facts.length) {
        lines.push("", "**Faits :**");
        for (const f of slide.facts) lines.push(`- **${f.label}** : ${f.value}`);
      }
      if (slide.callout) {
        lines.push("", `> ⚠ **${slide.callout.title}** — ${slide.callout.body}`);
      }
      return lines.join("\n");

    case "anchor-bars":
      lines.push(`### ${slide.title}`, "", slide.description);
      if (slide.destinations.length) {
        lines.push("", "**Top destinations :**");
        for (const d of slide.destinations.slice(0, 6)) {
          lines.push(`- ${d.destination}`);
          for (const a of d.anchors.slice(0, 5)) {
            lines.push(`  - « ${a.text || "(vide)"} » : ${a.count}`);
          }
        }
      }
      return lines.join("\n");

    case "anchor-table":
      lines.push(`### ${slide.title}`, "", slide.description);
      if (slide.rows.length) {
        lines.push("", "| URL | Liens | Ancres uniques | Diversité | Ancre dominante |", "| --- | --- | --- | --- | --- |");
        for (const r of slide.rows.slice(0, 15)) {
          lines.push(`| ${r.destination} | ${r.inlinks_count} | ${r.unique_anchors} | ${r.diversity_ratio.toFixed(2)} | « ${r.dominant_anchor} » (${r.dominant_anchor_pct}%) |`);
        }
      }
      return lines.join("\n");

    case "anchor-low-diversity":
      lines.push(`### ${slide.title}`, "", slide.description);
      if (slide.rows.length) {
        const excluded = new Set(slide.excluded_destinations || []);
        const visible = slide.rows.filter((r) => !excluded.has(r.destination)).slice(0, 10);
        lines.push("", "| URL cible | Ancre dominante | Occurrences | Liens totaux | Domination |", "| --- | --- | --- | --- | --- |");
        for (const r of visible) {
          lines.push(`| ${r.destination} | « ${r.anchor} » | ${r.occurrences} | ${r.total_inlinks} | ${r.ratio_pct.toFixed(0)} % |`);
        }
        if (excluded.size) lines.push("", `_${excluded.size} URL(s) exclue(s) manuellement._`);
        const remaining = slide.rows.filter((r) => !excluded.has(r.destination)).length;
        if (remaining > visible.length) lines.push(`_+ ${remaining - visible.length} URLs concernées non listées._`);
      }
      return lines.join("\n");

    case "anchor-empty":
      lines.push(`### ${slide.title}`, "", slide.description);
      lines.push("", `**${slide.total_empty_links} liens vides détectés sur ${slide.total_groups} URLs cibles.**`);
      for (const g of slide.groups.slice(0, 6)) {
        lines.push("", `- **${g.destination}** (${g.sources.length} liens vides)`);
        for (const s of g.sources.slice(0, 4)) lines.push(`  - depuis : ${s}`);
        if (g.sources.length > 4) lines.push(`  - _+ ${g.sources.length - 4} autres._`);
      }
      return lines.join("\n");

    case "robots-current":
      lines.push(`### Robots.txt actuel`);
      if (slide.ai_overview) lines.push("", slide.ai_overview);
      if (slide.ai_issues.length) {
        lines.push("", "**Points bloquants :**");
        for (const it of slide.ai_issues) lines.push(`- ${it}`);
      }
      lines.push("", "**Fichier :**", "", "```", slide.raw_content || "(non fourni)", "```");
      return lines.join("\n");

    case "robots-improved":
      lines.push(`### Robots.txt recommandé`);
      if (slide.ai_improvements.length) {
        lines.push("", "**Améliorations clés :**");
        for (const it of slide.ai_improvements) lines.push(`- ${it}`);
      }
      lines.push("", "**Nouveau fichier :**", "", "```", slide.improved_content || "(non généré)", "```");
      return lines.join("\n");

    case "sitemap-overview":
      lines.push(`### Sitemap.xml`);
      lines.push("", `- URL : ${slide.sitemap_url}`);
      lines.push(`- URLs dans le sitemap : ${slide.url_count.toLocaleString("fr-FR")}`);
      lines.push(`- URLs indexables (crawl) : ${slide.indexable_count.toLocaleString("fr-FR")}`);
      lines.push(`- Absentes du sitemap : ${slide.missing_count.toLocaleString("fr-FR")}`);
      if (slide.last_modified) lines.push(`- Dernière modif : ${slide.last_modified}`);
      if (slide.ai_overview) lines.push("", slide.ai_overview);
      return lines.join("\n");

    case "sitemap-gaps":
      lines.push(`### Sitemap : pages absentes`, "", `${slide.missing_count.toLocaleString("fr-FR")} URLs indexables absentes du sitemap.`);
      if (slide.ai_gaps_summary) lines.push("", slide.ai_gaps_summary);
      if (slide.breakdown.length) {
        lines.push("", "| Section | Compte |", "| --- | --- |");
        for (const b of slide.breakdown) lines.push(`| ${b.label} | ${b.count} |`);
      }
      return lines.join("\n");

    case "reco":
      lines.push(`### ${slide.title}`);
      for (const g of slide.groups) {
        lines.push("", `**${g.sub_label}**`);
        for (const it of g.items) lines.push(`- ${it}`);
      }
      return lines.join("\n");

    case "priority":
      lines.push(`### ${slide.title}`);
      const items = slide.items.slice(0, 12);
      if (slide.view === "synthesis" || !slide.view) {
        if (slide.ai_summary) lines.push("", `> ${slide.ai_summary.replace(/\n/g, "\n> ")}`);
      }
      if (slide.view !== "synthesis") {
        lines.push("", "| Rang | Urgence | Catégorie | URLs | Effort | Impact | Justification |", "| --- | --- | --- | --- | --- | --- | --- |");
        for (const p of items) {
          lines.push(`| ${p.rank} | ${p.urgency} | ${p.title} | ${p.affected} | ${p.effort} | ${p.impact} | ${p.rationale.replace(/\|/g, "\\|")} |`);
        }
      }
      return lines.join("\n");

    case "custom":
      lines.push(`### ${slide.title}`);
      if (slide.eyebrow) lines.push(`_${slide.eyebrow}_`);
      if (slide.body) lines.push("", slide.body);
      return lines.join("\n");
  }
  return "";
}

export async function exportAdvancedToMarkdown(report: AdvReport, auditName: string): Promise<void> {
  const lines: string[] = [];

  // 1. Header
  lines.push(`# Audit technique SEO — ${auditName}`);
  if (report.domain) lines.push(`**Domaine :** ${report.domain}`);
  lines.push(`**Date :** ${report.generated_at}`);
  if (report.source_filename) lines.push(`**Source :** ${report.source_filename}`);
  lines.push("");

  // 2. Global score
  lines.push(`## Score global : ${report.global_score}/100`);
  lines.push("");
  lines.push("| Catégorie | Score | Poids | Résumé |");
  lines.push("| --- | --- | --- | --- |");
  for (const sec of report.sections) {
    lines.push(`| ${sec.label} | **${sec.score}/100** | ${sec.weight} | ${sec.summary.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");

  // 3. Diagnostics block
  const d = report.diagnostics;
  lines.push(`## Diagnostics (périmètre de l'analyse)`);
  lines.push(`- Pages HTML analysées : **${d.html_pages_count.toLocaleString("fr-FR")}** (dont ${d.indexable_html_count} indexables)`);
  lines.push(`- URLs de pagination exclues : ${d.pagination_excluded_count.toLocaleString("fr-FR")}`);
  lines.push(`- Liens contextuels analysés : ${d.contextual_links_count.toLocaleString("fr-FR")} (dont ${d.editorial_links_count} éditoriaux)`);
  lines.push(`- Ancres vides éditoriales : ${d.empty_editorial_anchor_count.toLocaleString("fr-FR")}`);
  if (d.anchor_filter_breakdown) {
    const b = d.anchor_filter_breakdown;
    lines.push(`- Filtres ancres :`);
    lines.push(`  - CTA templatés : ${b.template_cta}`);
    lines.push(`  - Liens-images : ${b.image_wrapping}`);
    lines.push(`  - Cartes : ${b.card_path}`);
    lines.push(`  - Boutons : ${b.button_path}`);
    lines.push(`  - Pagination : ${b.pagination_dest}`);
  }
  lines.push("");

  // 4. Site resources (robots / sitemap / llms.txt / structured data)
  if (report.site_resources) {
    const r = report.site_resources;
    lines.push(`## Ressources du site`);
    lines.push(`- **robots.txt** : ${r.robots_txt.fetched ? "présent" : "absent"} (${r.robots_txt.size_bytes ?? 0} octets, ${r.robots_txt.lines ?? 0} lignes)`);
    lines.push(`- **sitemap.xml** : ${r.sitemap_xml.fetched ? `présent, ${r.sitemap_xml.url_count ?? 0} URLs` : "absent"}`);
    lines.push(`- **llms.txt** : ${r.llms_txt.fetched ? "présent" : "absent"}`);
    if (r.structured_data) {
      lines.push(`- **Données structurées (homepage)** : ${r.structured_data.homepage_fetched ? `${r.structured_data.blocks_count} blocs, schémas ${r.structured_data.schemas_found.join(", ") || "(aucun)"}` : "non analysées"}`);
    }
    if (r.headers_sample) {
      lines.push(`- **Headers HTTP** : ${r.headers_sample.sample_size} URLs testées, ${r.headers_sample.with_etag} ETag, ${r.headers_sample.with_last_modified} Last-Modified`);
    }
    if (report.robots_txt_pasted) {
      lines.push("", "**robots.txt fourni à l'import :**", "", "```", report.robots_txt_pasted, "```");
    }
    if (report.sitemap_url) lines.push("", `_Sitemap URL fournie : ${report.sitemap_url}_`);
    lines.push("");
  }

  // 5. Slides : group by section heading using section-cover slides as
  //    delimiters. The render order is the same as the deck.
  lines.push(`## Contenu du deck (slide par slide)`);
  lines.push("");
  for (const slide of report.slides) {
    const md = slideToMd(slide);
    if (md) {
      lines.push(md);
      lines.push("");
    }
  }

  // 6. Issue detail tables : top N rows per subcategory.
  //    Gives the receiving AI enough sample data to spot-check.
  lines.push(`## Échantillons d'issues par catégorie`);
  lines.push(`_Top ${MAX_ISSUE_ROWS_PER_CAT} lignes par sous-catégorie. Le XLSX complet est exportable séparément._`);
  lines.push("");
  for (const sec of report.sections) {
    let any = false;
    for (const sub of sec.subcategories) {
      if (!sub.issues_full || sub.issues_full.length === 0) continue;
      if (!any) {
        lines.push(`### ${sec.label}`);
        any = true;
      }
      lines.push("", `**${sub.label}** (${sub.issues_full.length.toLocaleString("fr-FR")} lignes, score ${sub.score}/100)`);
      if (sub.why) lines.push(`_Pourquoi :_ ${sub.why}`);
      if (sub.how_to_fix) lines.push(`_Correction :_ ${sub.how_to_fix}`);
      lines.push("");
      lines.push(issueTable(sub.issues_full, sub.columns));
    }
    if (any) lines.push("");
  }

  // 7. Priority list (always include)
  if (report.priorities.length) {
    lines.push(`## Top ${Math.min(report.priorities.length, 12)} priorités`);
    lines.push("");
    lines.push("| Rang | Urgence | Sujet | URLs | Effort | Impact | Justification |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const p of report.priorities.slice(0, 12) as PriorityItem[]) {
      lines.push(`| ${p.rank} | ${p.urgency} | ${p.title} | ${p.affected} | ${p.effort} | ${p.impact} | ${p.rationale.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }

  const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  downloadString(lines.join("\n"), `audit-avance-${safeName || "seo"}-${date}.md`);
}
