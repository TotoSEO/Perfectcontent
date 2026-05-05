# PerfectContent

Solo single-user SEO content platform. Pipeline: SERP → scrape → semantic
analysis → blueprint → generation → image → internal linking → coverage scoring.

The browser orchestrates each pipeline step against serverless Python
functions. No worker, no Redis, no Docker — just **Vercel + Supabase**, free.

## Stack

- **Frontend** : Next.js (App Router), Tailwind, TipTap, SWR
- **Backend** : FastAPI, exposed as Vercel Python serverless functions
- **DB** : Supabase Postgres + pgvector
- **AI** : Anthropic (Claude Sonnet), OpenAI (embeddings), Fal.ai (Flux Pro)
- **External APIs** : DataForSEO, Firecrawl, Jina

## Pipeline steps

| # | Step | Notes |
|---|---|---|
| 1 | SERP + related keywords | DataForSEO, parallel, cached 24h |
| 2 | Scrape competitors | Firecrawl + Jina fallback, tolerance 4/7 |
| 3 | Parse structure | H1/H2/H3, lists, tables, FAQ, schema |
| 4 | Semantic report + top-40 corpus terms | Claude analysis + term frequencies |
| 5 | Blueprint | Editable plan H2/H3 + word target + angle |
| 6 | Generate content | Type-specific prompts, 3 title/meta variants |
| 7 | Image | Fal.ai Flux Pro, parallel with step 6 |
| 8 | Internal linking | pgvector kNN against the domain's indexed pages |
| 9 | Coverage scoring | Embedding cosine vs expected terms |

The browser drives the pipeline (each step is a serverless call ≤ 60 s).
**Keep the tab open during a generation** (~1 min/keyword). State is fully
persisted in Supabase, so closing mid-batch just pauses — re-open to resume.

## Deploy (Vercel + Supabase, ~15 min)

### 1. Supabase database

1. Sign up at [supabase.com](https://supabase.com) → New project.
2. SQL editor → run once :

   ```sql
   create extension if not exists vector;
   ```

3. Project Settings → Database → **Connection string** → URI **Session pooler**
   → reveal password → copy.

   You'll plug it into Vercel as `DATABASE_URL` after replacing the prefix
   `postgresql://` with `postgresql+asyncpg://`.

### 2. Vercel project

1. Push this repo to GitHub if not already.
2. Sign up at [vercel.com](https://vercel.com) with GitHub.
3. **Add New… → Project** → import the `perfectcontent` repo.
4. Framework preset: **Next.js** (auto-detected).
5. **Environment Variables** — add :

   ```
   DATABASE_URL=postgresql+asyncpg://...
   APP_PASSWORD=choose-a-strong-password
   SESSION_SECRET=run-`openssl rand -hex 32`
   CORS_ORIGINS=https://your-app.vercel.app
   ENV=prod

   DATAFORSEO_LOGIN=...
   DATAFORSEO_PASSWORD=...
   FIRECRAWL_API_KEY=...
   ANTHROPIC_API_KEY=...
   OPENAI_API_KEY=...
   FAL_API_KEY=...
   ```

6. **Deploy**.

### 3. Run migrations once

The Vercel build doesn't auto-migrate. Run Alembic against your Supabase
project from your laptop (one-off) :

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
DATABASE_URL='postgresql+asyncpg://...' alembic upgrade head
```

Then click **Redeploy** in Vercel so the new tables are picked up.

### 4. Custom domain (optional)

Vercel project → Settings → Domains → add `pc.yourdomain.com`. Follow the DNS
instructions (usually one CNAME). HTTPS auto.

## Local dev

```bash
# Backend
cd backend && cp .env.example .env
# fill DATABASE_URL pointing to local Postgres or Supabase
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload  # serves on :8000

# Frontend
cd frontend && cp .env.example .env.local  # NEXT_PUBLIC_API_BASE=http://localhost:8000
pnpm install && pnpm dev  # :3000
```

Set `MOCK_EXTERNAL=1` in backend `.env` to test the full pipeline offline
without paying any external API.

## Project layout

```
api/index.py              ← Vercel Python entry (FastAPI ASGI)
backend/app/              ← FastAPI app, services, models, routers
frontend/                 ← Next.js App Router
vercel.json               ← routes /api/* and /healthz/* to api/index.py
requirements.txt          ← Python deps for Vercel build
```

## Crawler protection

The app is gated behind a single password. On top of that :

- Every page sets `<meta name="robots" content="noindex,nofollow,nocache">`
- `/robots.txt` returns a global `Disallow: /`
- The Next.js `app/(app)/*` pages are private after login

If you ever want hardened access, put **Cloudflare Access** in front
(free up to 50 users) or password-protect at the Vercel level.
