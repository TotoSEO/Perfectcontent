// Types shared between the parser, analyzer, viewer and Excel exporter.
// The full report (Report) is what gets POSTed to /srv/audits and rendered by
// /audits/[id]. Keep this stable : changing it requires a schema migration in
// the DB JSONB columns.

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type IssueRow = {
  url: string;
  severity: Severity;
  // Free-form extra fields rendered as columns in the viewer + Excel:
  [key: string]: string | number | boolean | null | undefined;
};

export type CategoryReport = {
  id: string;        // stable category id ("http", "titles", "h1", ...)
  label: string;     // human label
  score: number;     // 0..100 : higher is better
  weight: number;    // contribution to the global score
  kpis: { label: string; value: number | string; tone?: "ok" | "warn" | "bad" }[];
  // Optional bar/donut/histogram data the slide viewer renders directly:
  chart?:
    | { type: "donut"; segments: { label: string; value: number; color: string }[] }
    | { type: "bar"; bars: { label: string; value: number; color?: string }[]; max?: number }
    | { type: "histogram"; bins: { label: string; value: number }[] };
  // Top issue rows (capped per category in the slide); the full set is in `issues_full`
  // for the Excel export.
  top_issues: IssueRow[];
  issues_full: IssueRow[];
  // Columns to render in the issue table (column key -> header label)
  columns: { key: string; label: string }[];
  // 1-2 sentence summary the slide can show as a takeaway
  summary?: string;
};

export type Report = {
  schema_version: 1;
  generated_at: string;       // ISO
  source_filename: string | null;
  url_count: number;
  crawl_date: string | null;  // ISO if SF gives us one, else null
  global_score: number;       // weighted average of category scores
  categories: CategoryReport[];
};
