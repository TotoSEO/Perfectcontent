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

## Production deploy (Oracle Cloud Free + Supabase)

Two services total. Free forever.

### 1. Supabase (database)

1. Create a project on [supabase.com](https://supabase.com).
2. SQL editor → run once: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Project Settings → Database → **Session pooler** connection string → copy.
4. Replace the scheme prefix `postgresql://` with `postgresql+asyncpg://`.
5. Save it for step 4 below as `DATABASE_URL`.

### 2. Oracle Cloud Free VM

1. Sign up on [cloud.oracle.com](https://cloud.oracle.com) (CC required for verification, never charged).
2. Create a Compute instance: shape **VM.Standard.A1.Flex** (ARM Ampere), 2 OCPU / 12GB RAM is plenty.
3. Image: **Ubuntu 22.04**.
4. Open ports 80 and 443 in the VCN security list (ingress, source `0.0.0.0/0`).
5. Note the public IP.

### 3. DNS

Point an A record (e.g. `pc.exemple.com`) to the VM's public IP.

### 4. App on the VM

SSH into the VM:

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Code
git clone https://github.com/totoseo/perfectcontent.git
cd perfectcontent
cp .env.prod.example .env.prod
nano .env.prod   # fill DOMAIN, PUBLIC_URL, DATABASE_URL, APP_PASSWORD, all API keys

# Migrate the Supabase DB once
docker compose -f compose.prod.yml --env-file .env.prod run --rm api alembic upgrade head

# Start
docker compose -f compose.prod.yml --env-file .env.prod up -d --build
```

Caddy auto-issues an HTTPS cert via Let's Encrypt on first request.

Open `https://pc.exemple.com`, log in with `APP_PASSWORD`. Done.

### Update / redeploy

```bash
git pull && docker compose -f compose.prod.yml --env-file .env.prod up -d --build
```

### Why crawl-blocking is enough

The app is opt-in (login wall + signed cookie). On top of that:
- Meta `robots: noindex, nofollow, nocache` on every page (set in `app/layout.tsx`).
- `/robots.txt` returns a global `Disallow: /`.
- Caddy returns 403 for any User-Agent matching `bot|crawler|spider|scraper`.

If you ever need a hardened public URL (paranoid mode), put Cloudflare Access in front — free up to 50 users, blocks unknown emails before hitting the VM.

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
