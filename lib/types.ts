export type Folder = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
};

export type Domain = {
  id: string;
  hostname: string;
  status: "pending" | "indexing" | "ready" | "error";
  last_indexed_at: string | null;
  pages_count: number;
  index_cost_usd: number;
  created_at: string;
};

export type ContentType = "blog" | "category" | "product" | "service_lp";

export type Job = {
  id: string;
  content_id: string | null;
  keyword: string;
  content_type: ContentType;
  location_code: number;
  language_code: string;
  domain_id: string | null;
  internal_linking: boolean;
  status: "queued" | "running" | "paused" | "done" | "failed" | "capped";
  current_step: string | null;
  cost_estimate_low: number | null;
  cost_estimate_high: number | null;
  cost_actual: number;
  cost_cap: number | null;
  error: string | null;
  audit: { steps?: { step: string; status: string; ts: number; payload?: unknown }[] };
  created_at: string;
  updated_at: string;
};

export type Section = {
  id: string;
  h2: string;
  bullets?: string[];
  element?: "table" | "faq" | "list" | "callout";
};

export type Blueprint = {
  title_target: string;
  angle: string;
  target_words: number;
  sections: Section[];
  schema_recommendations: string[];
};

export type TitleVariant = { title: string; meta: string };

export type InternalLink = {
  section_id: string;
  anchor: string;
  target_url: string;
  target_title: string | null;
  similarity: number;
};

export type Content = {
  id: string;
  folder_id: string | null;
  domain_id: string | null;
  keyword: string;
  content_type: ContentType;
  status: string;
  intent: string | null;
  blueprint: Blueprint | null;
  title_variants: TitleVariant[] | null;
  chosen_title: string | null;
  chosen_meta: string | null;
  html: string | null;
  markdown: string | null;
  image_url: string | null;
  schema_recommendations: Record<string, unknown> | null;
  internal_links: InternalLink[] | null;
  coverage_score: number | null;
  created_at: string;
  updated_at: string;
};
