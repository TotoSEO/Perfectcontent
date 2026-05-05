-- PerfectContent — bootstrap consolidé pour Supabase.
-- À copier-coller en une fois dans le SQL editor Supabase.
-- Idempotent : peut être ré-exécuté sans casse (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tables principales

CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_indexed_at TIMESTAMPTZ,
  pages_count INT DEFAULT 0,
  index_cost_usd NUMERIC(10, 4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  domain_id UUID REFERENCES domains(id),
  keyword TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'analysis',
  intent TEXT,
  blueprint JSONB,
  title_variants JSONB,
  chosen_title TEXT,
  chosen_meta TEXT,
  html TEXT,
  markdown TEXT,
  image_url TEXT,
  image_prompt TEXT,
  schema_recommendations JSONB,
  internal_links JSONB,
  coverage_score NUMERIC(5, 2),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contents_folder_id ON contents (folder_id);
CREATE INDEX IF NOT EXISTS ix_contents_domain_id ON contents (domain_id);
CREATE INDEX IF NOT EXISTS ix_contents_embedding
  ON contents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE TABLE IF NOT EXISTS indexed_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  h1 TEXT,
  meta_description TEXT,
  first_paragraph TEXT,
  full_content TEXT,
  embedding VECTOR(1536),
  is_draft BOOLEAN DEFAULT FALSE,
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_domain_url UNIQUE (domain_id, url)
);
CREATE INDEX IF NOT EXISTS ix_indexed_pages_domain_id ON indexed_pages (domain_id);
CREATE INDEX IF NOT EXISTS ix_indexed_pages_embedding
  ON indexed_pages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  content_type TEXT NOT NULL,
  location_code INT NOT NULL,
  language_code TEXT NOT NULL,
  domain_id UUID REFERENCES domains(id),
  internal_linking BOOLEAN DEFAULT FALSE,
  generate_image BOOLEAN NOT NULL DEFAULT FALSE,
  auto_validate_blueprint BOOLEAN NOT NULL DEFAULT FALSE,
  batch_id UUID,
  mode TEXT NOT NULL DEFAULT 'standard',
  source_content TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  current_step TEXT,
  cost_estimate_low NUMERIC(10, 4),
  cost_estimate_high NUMERIC(10, 4),
  cost_actual NUMERIC(10, 4) DEFAULT 0,
  cost_cap NUMERIC(10, 4),
  error TEXT,
  audit JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_jobs_content_id ON jobs (content_id);
CREATE INDEX IF NOT EXISTS ix_jobs_batch_id ON jobs (batch_id);

-- Si la table jobs existait déjà (migrations partielles), s'assurer que les colonnes récentes
-- sont bien là.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS generate_image BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS auto_validate_blueprint BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_content TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS use_haiku BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS semantic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  serp_raw JSONB,
  related_keywords JSONB,
  competitors JSONB,
  common_subthemes JSONB,
  rare_subthemes JSONB,
  entities JSONB,
  required_terms JSONB,
  content_gaps JSONB,
  term_targets JSONB,
  expected_terms_embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_semantic_reports_job_id ON semantic_reports (job_id);
ALTER TABLE semantic_reports ADD COLUMN IF NOT EXISTS term_targets JSONB;

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  cost_usd NUMERIC(10, 4) DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_api_cache_expires_at ON api_cache (expires_at);

CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT now(),
  level TEXT NOT NULL,
  module TEXT,
  message TEXT NOT NULL,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS ix_system_logs_ts ON system_logs (ts);
CREATE INDEX IF NOT EXISTS ix_system_logs_level ON system_logs (level);

-- 3. Silos (page pilier + satellites maillés en silo SEO)

CREATE TABLE IF NOT EXISTS silos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  pillar_keyword TEXT,
  pillar_content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
  pillar_external_url TEXT,
  base_url TEXT NOT NULL,
  trailing_slash BOOLEAN NOT NULL DEFAULT FALSE,
  domain_id UUID REFERENCES domains(id),
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  batch_id UUID,
  status TEXT NOT NULL DEFAULT 'planning',
  mesh_audit JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contents ADD COLUMN IF NOT EXISTS silo_id UUID REFERENCES silos(id) ON DELETE SET NULL;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS silo_role TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS link_manifest JSONB;
CREATE INDEX IF NOT EXISTS ix_contents_silo_id ON contents (silo_id);

-- Fini. Aucune donnée seed nécessaire.
