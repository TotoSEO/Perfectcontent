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
  anchor: string;
  position: string; // "Body" / "Header" / "Footer" / "Nav" / ...
  is_generic: boolean;
  is_empty: boolean;
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
  | {
      kind: "reco";
      section_id: string;
      title: string;             // "Recommandations : Indexabilité & crawl"
      groups: { sub_label: string; items: string[] }[];
    }
  | {
      kind: "priority";
      title: string;
      // Always computed deterministically : never AI-hallucinated:
      items: PriorityItem[];
      // Optional Claude-generated narrative summary (1-3 short paragraphs).
      ai_summary: string | null;
      ai_summary_error: string | null;
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
  // Issues full set (used in the XLSX). The slide gets a summary count + the
  // top items only for context.
  issues_full: AdvIssueRow[];
  // Columns for the XLSX tab (drives column order + header text).
  columns: { key: string; label: string; width?: number }[];
  // The XLSX tab name (kept stable across the slide + export).
  xlsx_sheet: string;
};

export type AdvSection = {
  id: string;
  label: string;
  score: number;       // 0..100 weighted from subcategories
  weight: number;      // contribution to global
  summary: string;     // short status line for the synthesis slide
  subcategories: AdvSubcategory[];
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
  sections: AdvSection[];
  priorities: PriorityItem[];
  // Filled lazily by the viewer page (one Claude Haiku call ~0.002 $).
  ai_summary: string | null;
  // Full ordered slide list (computed once from sections + priorities).
  slides: AdvSlide[];
};
