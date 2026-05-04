# PerfectContent

Solo single-user SEO content platform. Pipeline: SERP → scrape → semantic analysis → blueprint → generation → image → internal linking → coverage scoring.

## Stack

- **Backend**: FastAPI, SQLAlchemy async, RQ workers, Redis, PostgreSQL + pgvector
- **Frontend**: Next.js (App Router), Tailwind, TipTap, Zustand
- **AI**: Anthropic (Claude Sonnet), OpenAI (embeddings), Fal.ai (Flux Pro)
- **External APIs**: DataForSEO, Firecrawl, Jina

## Quick start (dev)

```bash
docker compose up -d postgres redis

cd backend
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload &
rq worker default index &

cd ../frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

Open http://localhost:3000 — login with `APP_PASSWORD` from `.env`.

## Database: Supabase (production)

1. Create a Supabase project.
2. In SQL editor, run once: `CREATE EXTENSION IF NOT EXISTS vector;` (pgcrypto is already enabled).
3. Project Settings → Database → Connection string → URI → copy.
4. Adapt the URI in `.env`: prefix `postgresql+asyncpg://` instead of `postgresql://` and prefer
   the Session pooler endpoint (port 5432) for long-running workers.
5. Run `alembic upgrade head` once locally pointing at the Supabase URL.
6. Redis can stay on Upstash (serverless, pay-per-request) — set `REDIS_URL` accordingly.

The codebase doesn't use Supabase Auth (single-user via `APP_PASSWORD`), only its Postgres.

## Pipeline steps

| # | Step | Notes |
|---|---|---|
| 1 | SERP + related keywords | DataForSEO, parallel, cached 24h |
| 2 | Scrape competitors | Firecrawl + Jina fallback, tolerance 4/7 |
| 3 | Parse structure | H1/H2/H3, lists, tables, FAQ, schema |
| 4 | Semantic report | Claude analyzes coverage, gaps, entities |
| 5 | Blueprint | Editable plan H2/H3 + word target + angle |
| 6 | Generate content | Type-specific prompts, 3 title/meta variants |
| 7 | Image | Fal.ai Flux Pro, parallel with step 6 |
| 8 | Internal linking | pgvector kNN against domain index |
| 9 | Coverage scoring | Embedding cosine vs expected terms |

## Project layout

```
backend/
  app/
    main.py, config.py, auth.py, db.py, cache.py, audit.py
    models/   schemas/   routers/   services/   workers/
  alembic/   tests/
frontend/
  app/  components/  lib/
docker-compose.yml
```

See `/root/.claude/plans/ok-oublions-ce-qui-lucky-goose.md` for the full design plan.
