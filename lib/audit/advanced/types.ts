// Types for the "Audit technique avancé" feature.
// Imports : 2 files : interne_html.csv (Screaming Frog FR Internal export) +
// a ZIP of "Bulk Export > Issues > All". Plus optional all_inlinks.csv for
// detailed anchor analysis. Output : a multi-section report with cover slides,
// data slides, recommendation slides, and a final AI-assisted priority slide.

import type { Severity } from "../types";

export type AdvKPI = {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "bad" | "info";
  hint?: string;
};

export type AdvChart =
  | { type: "donut"; segments: { label: string; value: number; color: string }[] }
  | { type: "bar"; bars: { label: string; value: number; color?: string }[]; max?: number; orientation?: "horizontal" | "vertical" }
  | { type: "histogram"; bins: { label: string; value: number }[] }
  | { type: "stat-grid"; items: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" }[] };

export type AdvIssueRow = {
  url: string;
  severity: Severity;
  [key: string]: string | number | boolean | null | undefined;
};

export type AnchorRow = {
  source: string;
  destination: string;
  anchor: string;            // raw Ancrage, else Texte Alt fallback
  position: string;          // Contenu / Navigation / En-tête / Pied de page
  is_generic: boolean;       // anchor text in the generic list (ici, cliquez…)
  is_empty: boolean;         // BOTH Ancrage AND Texte Alt are empty
  is_template_cta: boolean;  // anchor matches a templated CTA wording
  is_image_link: boolean;    // <a><img alt="…"></a> : not a real anchor
  is_card_like: boolean;     // Chemin du lien matches a card pattern
  is_button_like: boolean;   // Chemin du lien matches a button pattern
  link_path: string;         // raw Chemin du lien for the XLSX export
};

export type AnchorDestinationSummary = {
  destination: string;
  inlinks_count: number;
  unique_anchors: number;
  diversity_ratio: number; // 0..1
  dominant_anchor: string;
  dominant_anchor_count: number;
  dominant_anchor_pct: number; // 0..100
};

// ---- PageSpeed Insights (Google Lighthouse) ----
// Fetched server-side once per analysed URL at audit-creation time (before
// the audit is persisted). The full opportunity list is exported to the
// dedicated "PageSpeed Insights" XLSX sheet; the slide shows the score,
// FCP / LCP and the top 3 problems only.
export type PageSpeedMetric = {
  id: string;
  label: string;
  display: string;       // "2,1 s", "0,02"…
  score: number | null;  // 0..1
};

export type PageSpeedOpportunity = {
  id: string;
  title: string;
  display: string;       // "Économie estimée de 1,2 s" (may be "")
  description: string;
  savings_ms: number;
  score: number | null;
};

export type PageSpeedResult = {
  url: string;
  final_url: string | null;
  strategy: string;
  fetched: boolean;
  performance_score: number | null;  // 0..100
  fcp: PageSpeedMetric | null;
  lcp: PageSpeedMetric | null;
  metrics: PageSpeedMetric[];
  opportunities: PageSpeedOpportunity[];
  error: string | null;
};

// Slide kinds : drives rendering in the viewer.
export type AdvSlide =
  | {
      kind: "cover";
      audit_name: string;
      url_count: number;
      sections_count: number;
      issues_count: number;
      generated_at: string;
    }
  | {
      kind: "summary";
      sections: { id: string; label: string; score: number; weight: number; summary: string }[];
      global_score: number;
    }
  | {
      kind: "section-cover";
      section_id: string;
      title: string;            // "Indexabilité & crawl"
      eyebrow: string;          // "Partie 2 / 7"
      icon: string;             // "compass" / "speed" / ...
      bullets: string[];        // subsection titles preview
    }
  | {
      kind: "data";
      section_id: string;
      sub_id: string;            // stable id used by xlsx tab linkage
      title: string;             // "Profondeur des pages"
      description: string;       // explanatory text
      kpis: AdvKPI[];
      chart?: AdvChart;
      // The XLSX tab name to reference if there are errors. When set, a
      // "Voir l'onglet …" badge appears on the slide.
      xlsx_sheet?: string;
      issues_count: number;
      // Optional textual takeaway (1 line, displayed under KPIs).
      takeaway?: string;
    }
  | {
      kind: "info";
      section_id: string;
      sub_id: string;
      title: string;
      description: string;
      // Optional callout (the "À prendre avec des pincettes" block on LLMS.txt).
      callout?: { tone: "warn" | "info"; title: string; body: string };
      // Optional facts/figures grid (e.g. "844 000 sites ont adopté llms.txt").
      facts?: { label: string; value: string }[];
      // When true, the right-hand side of the slide is replaced by an
      // empty styled "drop your screenshot here" placeholder card.
      // Used on the "Rendu sans JavaScript" slide so the consultant can
      // paste a screenshot of their before/after JS-disabled test into
      // the deliverable.
      screenshot_placeholder?: boolean;
    }
  | {
      kind: "anchor-bars";
      section_id: string;
      sub_id: string;
      title: string;
      description: string;
      // Top destination pages with their top anchors (compact bar chart).
      destinations: { destination: string; anchors: { text: string; count: number }[] }[];
      xlsx_sheet?: string;
      issues_count: number;
    }
  | {
      kind: "anchor-table";
      section_id: string;
      sub_id: string;
      title: string;
      description: string;
      rows: AnchorDestinationSummary[];
      xlsx_sheet?: string;
      issues_count: number;
    }
  // ---- New anchor slides (replace anchor-bars / anchor-table) ----
  | {
      // Top URLs whose dominant anchor over-represents their inlinks.
      // Each row : a single (destination, anchor) pair with its occurrence
      // count and the total number of contextual inlinks that page receives.
      // Empty anchors are NOT in this slide (those go to anchor-empty).
      kind: "anchor-low-diversity";
      section_id: string;
      sub_id: string;
      title: string;
      description: string;
      // FULL candidate list, sorted worst-first. The slide renders the first
      // 4 NON-EXCLUDED rows ; when the consultant marks a row as "non
      // pertinent" (RGPD, mentions légales etc.) it is added to
      // `excluded_destinations` and the next-worst row takes its place
      // automatically.
      rows: {
        destination: string;
        anchor: string;
        occurrences: number;
        total_inlinks: number;
        ratio_pct: number;
      }[];
      // Destination URLs marked as "non pertinent" by the consultant.
      // Persisted with the audit (so the exclusion sticks across reloads).
      excluded_destinations?: string[];
      // Total number of destinations matching the under-diversified criterion.
      // Used by the "+ X URLs concernées" footnote when the visible table
      // doesn't cover them all.
      total_concerned: number;
      xlsx_sheet?: string;
      issues_count: number;
    }
  | {
      // URLs receiving inbound links with an empty anchor in the body
      // (Ancrage AND Texte Alt both empty). Image-wrapping links, template
      // CTAs, card-like and button-like paths are excluded.
      // The slide groups rows by destination so the consultant can see
      // exactly which target pages are affected and from where.
      kind: "anchor-empty";
      section_id: string;
      sub_id: string;
      title: string;
      description: string;
      groups: {
        destination: string;
        sources: string[];  // every source URL with an empty editorial anchor toward this dest
      }[];
      total_groups: number;       // total destinations affected
      total_empty_links: number;  // total empty editorial inbound links
      xlsx_sheet?: string;
      issues_count: number;
    }
  | {
      kind: "reco";
      section_id: string;
      title: string;             // "Recommandations : Indexabilité & crawl"
      groups: { sub_label: string; items: string[] }[];
    }
  | {
      // Synthèse slide with radar chart (replaces "summary").
      // The intro paragraph + best/worst lists are generated by Claude
      // Haiku via /srv/audits/synthesis-overview ; the viewer renders a
      // skeleton + button to trigger generation when ai_intro is null.
      kind: "synthesis-radar";
      sections: { id: string; label: string; score: number; weight: number }[];
      global_score: number;
      // Lazy-filled by the audit viewer page (cost ~0.001 $).
      ai_intro: string | null;
      ai_intro_error: string | null;
      ai_best: string[];   // "Web performance (90%)"
      ai_worst: string[];
    }
  | {
      // Current robots.txt analysis (text left + screenshot placeholder right).
      // When robots.txt content was pasted at import time, the audit creator
      // triggers /srv/audits/robots-analysis once. The result drives:
      //  • this slide (always shown if content was pasted)
      //  • the "improved" slide below (shown ONLY if not is_good)
      kind: "robots-current";
      domain: string | null;
      raw_content: string;          // raw pasted robots.txt for the screenshot column
      ai_overview: string | null;   // 3-5 sentences, populated by AI
      ai_issues: string[];          // 3-6 bullet points
      ai_is_good: boolean;          // when true, only this slide is shown
      ai_error: string | null;
    }
  | {
      // Improved robots.txt recommendation (only emitted when ai_is_good=false).
      kind: "robots-improved";
      domain: string | null;
      improved_content: string;     // the recommended cleaned robots.txt
      ai_improvements: string[];    // 3-6 changes between current and improved
    }
  | {
      // Structured data analysis driven by the Screaming Frog "Données
      // structurées" export (donnees_structurees_tous.csv) : authoritative
      // site-wide schema.org type inventory. The AI reasons over it (what to
      // enrich, what's missing and where, what to fix) — not a quick verdict.
      kind: "structured-sf";
      page_count: number;
      pages_with_data: number;
      total_errors: number;
      total_warnings: number;
      pages_with_errors: number;
      distinct_types: number;
      top_types: { type: string; pages: number }[];
      strategic: { url: string; types: string[] }[];
      issues_count: number;
      xlsx_sheet?: string;
      // Lazy-filled by the viewer (one Claude Sonnet call : real reasoning).
      ai_overview: string | null;
      ai_recommendations: string[];
      ai_error: string | null;
    }
  | {
      // PageSpeed Insights result for ONE analysed page. Two of these are
      // emitted (one per URL the consultant enters). All fields except url
      // / strategy are filled at audit-creation time from the PSI API ;
      // until then they stay at their empty defaults (fetched=false).
      kind: "pagespeed";
      url: string;
      strategy: string;                 // "mobile" / "desktop"
      fetched: boolean;
      performance_score: number | null; // 0..100
      fcp: PageSpeedMetric | null;
      lcp: PageSpeedMetric | null;
      metrics: PageSpeedMetric[];
      // Top 3 problems shown on the slide. The full list lives in the XLSX.
      top_issues: { title: string; display: string }[];
      total_issues: number;
      xlsx_sheet?: string;              // "PageSpeed Insights" once issues exist
      error: string | null;
    }
  | {
      // Sitemap.xml analysis driven by the Screaming Frog "Sitemaps" export
      // (sitemaps_tous.csv) : every figure is authoritative (no fetch, no
      // guess). The AI only writes the interpretation + the action to take.
      kind: "sitemap-sf";
      content_url_count: number;
      indexable_count: number;
      non_indexable_count: number;
      non_200_count: number;
      sitemap_file_count: number;
      breakdown: { label: string; count: number }[];
      issues_count: number;
      xlsx_sheet?: string;
      // Lazy-filled by the viewer (one Claude Haiku call).
      ai_overview: string | null;        // interpretation of the figures
      ai_recommendation: string | null;  // the stake + how to fix (action plan)
      ai_error: string | null;
    }
  | {
      // Sitemap.xml analysis — fetched server-side then summarised by AI.
      kind: "sitemap-overview";
      sitemap_url: string;
      ai_overview: string | null;
      url_count: number;            // # URLs found in the sitemap (after index expansion)
      indexable_count: number;      // # of indexable URLs in the crawl
      missing_count: number;        // # of indexable URLs absent from the sitemap
      last_modified: string | null;
      ai_error: string | null;
    }
  | {
      // Sitemap gaps detail (only emitted when missing_count > 0).
      kind: "sitemap-gaps";
      missing_count: number;
      ai_gaps_summary: string | null;
      breakdown: { label: string; count: number }[];
    }
  | {
      kind: "priority";
      title: string;
      // "kanban" = the lanes (legacy / default). "synthesis" = the AI
      // narrative full-width. Splitting in 2 slides keeps both readable
      // (one slide isn't tall enough for both at once).
      view?: "kanban" | "synthesis";
      items: PriorityItem[];
      ai_summary: string | null;
      ai_summary_error: string | null;
    }
  | {
      // Free-form slide inserted by the user via the in-app editor.
      // Title is rendered by the slide chrome ; body is plain text with
      // blank-line-separated paragraphs.
      kind: "custom";
      title: string;
      body: string;
      // Optional eyebrow shown above the title (defaults to "Note").
      eyebrow?: string;
    };

export type PriorityItem = {
  rank: number;
  section_id: string;
  sub_id: string;
  title: string;        // "Pages en 404"
  urgency: "critical" | "high" | "medium" | "low";
  // The 1-liner explanation of why this is urgent (deterministic, not AI):
  rationale: string;
  affected: number;     // # URLs affected
  effort: "quick-win" | "medium" | "deep";
  impact: "high" | "medium" | "low";
};

export type AdvSubcategory = {
  id: string;
  label: string;
  score: number;
  // Relative weight inside the parent section, used by the section score
  // aggregation. Default 1 (equal weight). A subcategory pinned at score
  // 100 for informational reasons (noindex_pages, schemas_detected when
  // homepage didn't fetch…) should have weight 0 so it doesn't dilute
  // the real signal.
  weight?: number;
  // Issues full set (used in the XLSX). The slide gets a summary count + the
  // top items only for context.
  issues_full: AdvIssueRow[];
  // Columns for the XLSX tab (drives column order + header text).
  columns: { key: string; label: string; width?: number }[];
  // The XLSX tab name (kept stable across the slide + export).
  xlsx_sheet: string;
  // Client-facing guidance rendered as a context block at the top of each
  // XLSX sheet, so the file is self-explanatory without the slides:
  //   why       : why this is a problem (1 sentence)
  //   how_to_fix : concrete remediation steps (1-2 sentences)
  // Populated centrally in the orchestrator from SUB_GUIDE.
  why?: string;
  how_to_fix?: string;
};

export type AdvSection = {
  id: string;
  label: string;
  score: number;       // 0..100 weighted from subcategories
  weight: number;      // contribution to global
  summary: string;     // short status line for the synthesis slide
  subcategories: AdvSubcategory[];
};

// Transparency block surfaced in the XLSX "Exclusions" sheet and used
// by some slide footers to make the analysis perimeter explicit.
export type AuditDiagnostics = {
  // URLs detected as pagination and excluded from every count.
  pagination_excluded_count: number;
  // Total HTML pages found in interne_html.csv (text/html content type)
  // after pagination filtering. Used by slides that need to display the
  // "perimeter" footnote.
  html_pages_count: number;
  // Indexable subset of html_pages_count.
  indexable_html_count: number;
  // Total contextual links found in liens_entrants_tous.csv (Position=Contenu).
  contextual_links_count: number;
  // Editorial subset of contextual links (after CTA / card / button / image filter).
  editorial_links_count: number;
  // Empty editorial anchors (no Ancrage and no Texte Alt).
  empty_editorial_anchor_count: number;
  // Per-bucket counters for the anchor filtering (templated CTA, image-
  // wrapping, card-like path, button-like path, pagination destination).
  anchor_filter_breakdown?: {
    template_cta: number;
    image_wrapping: number;
    card_path: number;
    button_path: number;
    pagination_dest: number;
  };
};

export type AdvReport = {
  schema_version: 1;
  audit_type: "advanced";
  generated_at: string;
  source_filename: string | null;
  domain: string | null;
  url_count: number;
  html_count: number;
  global_score: number;
  diagnostics: AuditDiagnostics;
  // Site-level inputs fetched server-side (robots.txt / sitemap.xml / llms.txt)
  // : may be null on failure; the slide degrades gracefully.
  site_resources: {
    robots_txt: {
      fetched: boolean;
      size_bytes: number | null;
      lines: number | null;
      has_sitemap_ref: boolean;
      user_agents: number;
      disallow_count: number;
      allow_count: number;
      raw_preview?: string;
      // IA-crawler analysis (new : drives the GEO section)
      ia_bots_declared?: string[];
      ia_bots_blocked?: string[];
      ia_bots_allowed?: string[];
    };
    sitemap_xml: { fetched: boolean; url_count: number | null; nested_count?: number; duplicates: number; reference_in_robots: boolean };
    llms_txt: { fetched: boolean; size_bytes: number | null; lines?: number | null };
    structured_data?: {
      homepage_fetched: boolean;
      blocks_count: number;
      schemas_found: string[];
      raw_preview?: string | null;
    };
    headers_sample?: {
      sample_size: number;
      with_etag: number;
      with_last_modified: number;
    };
  } | null;
  // User-provided inputs from the import form. Drives the robots.txt
  // and sitemap.xml AI-analysis slides : safer + cleaner than fetching
  // through a server proxy (handles authentication, WAF, staging URLs).
  robots_txt_pasted: string | null;
  sitemap_url: string | null;
  sections: AdvSection[];
  priorities: PriorityItem[];
  // Filled lazily by the viewer page (one Claude Haiku call ~0.002 $).
  ai_summary: string | null;
  // Full ordered slide list (computed once from sections + priorities).
  slides: AdvSlide[];
};
