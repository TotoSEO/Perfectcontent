"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Icon } from "@/components/Icon";

type Annotation = {
  title: string | null;
  url: string | null;
  source_model: string;
};

type ModelResp = {
  model: string;
  response_text: string;
  fan_out_queries: string[];
  annotations: Annotation[];
  input_tokens: number;
  output_tokens: number;
  money_spent: number;
  cost: number;
  error: string | null;
};

type UniqueQuery = { query: string; models: string[]; model_count: number };
type Citation = { url: string; title: string | null; models: string[]; model_count: number };

type Report = {
  id: string;
  keyword: string;
  country_iso: string | null;
  models: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  cost: number;
  responses: ModelResp[] | null;
  unique_queries: UniqueQuery[] | null;
  citations: Citation[] | null;
  created_at: string;
  updated_at: string;
};

const MODEL_LABEL: Record<string, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

export default function FanoutDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, mutate, error } = useSWR<Report>(
    id ? `/srv/fanout/${id}` : null,
    fetcher,
    { refreshInterval: (latest) => (latest?.status === "running" || latest?.status === "queued" ? 3000 : 0) },
  );

  const [rerunBusy, setRerunBusy] = useState(false);

  async function rerun() {
    if (!id) return;
    setRerunBusy(true);
    try {
      await api(`/srv/fanout/${id}/run`, { method: "POST" });
      mutate();
    } catch (e) {
      alert(String(e));
    } finally {
      setRerunBusy(false);
    }
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-4">
          Erreur de chargement : {String(error)}
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="page-shell text-zinc-500 text-sm">Chargement…</div>;
  }

  const running = data.status === "queued" || data.status === "running";
  const allQueries = data.unique_queries ?? [];
  const allCitations = data.citations ?? [];
  const responses = data.responses ?? [];

  return (
    <div className="page-shell space-y-7">
      <header className="animate-rise flex items-start justify-between gap-4">
        <div>
          <Link
            href="/fan-out"
            className="eyebrow inline-flex items-center gap-1 mb-2 hover:text-zinc-200 transition"
          >
            <Icon name="arrow-left" size={11} />
            Tous les fan-outs
          </Link>
          <h1 className="h-page line-clamp-2">{data.keyword}</h1>
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            <span className="font-mono">{data.country_iso || "—"}</span>
            <span>•</span>
            <span>{data.models.split(",").filter(Boolean).map((m) => MODEL_LABEL[m] || m).join(" · ")}</span>
            <span>•</span>
            <span className="tabular-nums">${data.cost.toFixed(4)}</span>
          </div>
        </div>
        <button onClick={rerun} disabled={running || rerunBusy} className="btn-secondary">
          {running ? <Icon name="spinner" size={14} /> : <Icon name="refresh" size={14} />}
          {running ? "En cours…" : "Relancer"}
        </button>
      </header>

      {running && (
        <div className="card p-6 text-center text-zinc-400 animate-rise">
          <Icon name="spinner" size={18} className="text-accent-300 mx-auto mb-2" />
          Interrogation des LLM en cours, ~10-40 s…
        </div>
      )}

      {data.status === "failed" && (
        <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-4 animate-rise">
          <div className="font-medium mb-1 flex items-center gap-2">
            <Icon name="alert" size={14} />
            Le fan-out a échoué
          </div>
          <div className="text-sm">{data.error}</div>
        </div>
      )}

      {data.status === "done" && (
        <>
          {/* Aggregated fan-out queries — the actionable output */}
          <section className="card p-5 space-y-4 animate-rise">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  Requêtes fan-out
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Les requêtes que les LLM auraient lancées en arrière-plan.
                  Trier par recoupement entre modèles : plus de modèles = plus
                  pertinent à couvrir.
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    allQueries.map((q) => q.query).join("\n"),
                  );
                }}
                className="btn-secondary text-xs"
                title="Copier toutes les requêtes (une par ligne)"
              >
                <Icon name="copy" size={12} />
                Copier
              </button>
            </div>
            {allQueries.length === 0 ? (
              <div className="text-sm text-zinc-500">
                Aucune requête fan-out remontée. Les LLM n'ont peut-être pas activé
                la recherche web ou la requête était trop spécifique.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {allQueries.map((q) => (
                  <div
                    key={q.query}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/40 text-sm"
                  >
                    <span className="text-zinc-200 truncate">{q.query}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {q.models.map((m) => (
                        <span
                          key={m}
                          className="text-[9px] uppercase px-1 py-0.5 rounded border border-zinc-700/60 text-zinc-400"
                          title={MODEL_LABEL[m] || m}
                        >
                          {m.slice(0, 4)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Citations (annotations) */}
          <section className="card p-5 space-y-4 animate-rise" style={{ animationDelay: "60ms" }}>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Sources citées</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                URLs sourcées par les LLM dans leurs réponses. Cibles potentielles
                d'analyse concurrentielle ou de backlinks.
              </p>
            </div>
            {allCitations.length === 0 ? (
              <div className="text-sm text-zinc-500">
                Aucune source citée (recherche web inactive sur tous les modèles).
              </div>
            ) : (
              <div className="space-y-1.5">
                {allCitations.map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/40 text-sm hover:border-accent-500/40 transition group"
                  >
                    <Icon name="external" size={11} className="text-zinc-500 group-hover:text-accent-300 shrink-0" />
                    <span className="text-zinc-200 truncate flex-1">
                      {c.title || c.url}
                    </span>
                    <span className="text-[10px] text-zinc-500 truncate max-w-[16rem] hidden md:inline">
                      {c.url}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.models.map((m) => (
                        <span
                          key={m}
                          className="text-[9px] uppercase px-1 py-0.5 rounded border border-zinc-700/60 text-zinc-400"
                        >
                          {m.slice(0, 4)}
                        </span>
                      ))}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* Per-model raw responses */}
          <section className="space-y-3 animate-rise" style={{ animationDelay: "120ms" }}>
            <div className="label">Réponses par modèle</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {responses.map((r) => (
                <div key={r.model} className="card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-zinc-100">
                      {MODEL_LABEL[r.model] || r.model}
                    </div>
                    <div className="text-[10px] text-zinc-500 tabular-nums">
                      ${r.cost.toFixed(4)} · {r.input_tokens + r.output_tokens} tok
                    </div>
                  </div>
                  {r.error ? (
                    <div className="text-xs text-red-300/90 border border-red-800/40 bg-red-500/5 rounded p-2">
                      {r.error}
                    </div>
                  ) : (
                    <>
                      <details className="text-sm text-zinc-300">
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-200">
                          Texte de la réponse ({r.response_text.length} car.)
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-300 max-h-72 overflow-y-auto p-2 rounded bg-zinc-900/60 border border-zinc-800">
                          {r.response_text || "(vide)"}
                        </pre>
                      </details>
                      <div className="text-[11px] text-zinc-500">
                        {r.fan_out_queries.length} requête{r.fan_out_queries.length > 1 ? "s" : ""} fan-out
                        · {r.annotations.length} source{r.annotations.length > 1 ? "s" : ""}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
