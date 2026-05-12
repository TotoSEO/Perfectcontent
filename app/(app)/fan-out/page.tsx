"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { SkeletonList } from "@/components/Skeleton";

type Item = {
  id: string;
  keyword: string;
  country_iso: string | null;
  models: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  cost: number;
  created_at: string;
  updated_at: string;
};

const STATUS: Record<Item["status"], { label: string; className: string }> = {
  queued: { label: "En attente", className: "border-zinc-700 text-zinc-400 bg-zinc-800/40" },
  running: { label: "Fan-out…", className: "border-blue-700/50 text-blue-300 bg-blue-500/10" },
  done: { label: "Prêt", className: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10" },
  failed: { label: "Échec", className: "border-red-700/50 text-red-300 bg-red-500/10" },
};

const ALL_MODELS: { id: string; label: string; hint: string }[] = [
  { id: "chat_gpt", label: "ChatGPT", hint: "gpt-4.1-mini · le moins cher" },
  { id: "gemini", label: "Gemini", hint: "calque Google AI Overviews" },
  { id: "perplexity", label: "Perplexity", hint: "citations natives" },
  { id: "claude", label: "Claude", hint: "couverture étendue" },
];

const COUNTRIES_ISO: { iso: string; label: string; flag: string }[] = [
  { iso: "FR", label: "France", flag: "🇫🇷" },
  { iso: "BE", label: "Belgique", flag: "🇧🇪" },
  { iso: "CH", label: "Suisse", flag: "🇨🇭" },
  { iso: "CA", label: "Canada", flag: "🇨🇦" },
  { iso: "US", label: "États-Unis", flag: "🇺🇸" },
  { iso: "GB", label: "Royaume-Uni", flag: "🇬🇧" },
  { iso: "ES", label: "Espagne", flag: "🇪🇸" },
  { iso: "DE", label: "Allemagne", flag: "🇩🇪" },
  { iso: "IT", label: "Italie", flag: "🇮🇹" },
];

export default function FanoutListPage() {
  const router = useRouter();
  const { data, mutate } = useSWR<Item[]>("/srv/fanout", fetcher, {
    refreshInterval: 4000,
  });

  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("FR");
  const [models, setModels] = useState<string[]>(["chat_gpt", "gemini", "perplexity"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleModel(id: string) {
    setModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  async function create() {
    if (!keyword.trim() || models.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await api<Item>("/srv/fanout", {
        method: "POST",
        json: {
          keyword: keyword.trim(),
          country_iso: country,
          models,
        },
      });
      setKeyword("");
      mutate();
      api(`/srv/fanout/${created.id}/run`, { method: "POST" }).catch(() => {});
      router.push(`/fan-out/${created.id}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce fan-out ?")) return;
    await api(`/srv/fanout/${id}`, { method: "DELETE" });
    mutate();
  }

  const costEstimate = models.length * 0.005;

  return (
    <div className="page-shell space-y-7">
      <header className="animate-rise">
        <div className="eyebrow mb-2 inline-flex items-center gap-2">
          <Icon name="sparkles" size={11} />
          AI SEO
        </div>
        <h1 className="h-page">Query Fan-Out</h1>
        <p className="h-sub max-w-2xl">
          Pour un mot-clé, interroge ChatGPT, Gemini, Perplexity ou Claude avec
          recherche web active. Récupère les requêtes que les LLM auraient
          lancées (fan-out) et les sources qu'ils citent. Idéal pour briefer un
          contenu compatible AI Overviews / réponses génératives.
        </p>
      </header>

      <section
        className="card p-5 space-y-4 animate-rise"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="label block mb-1.5">Mot-clé / question</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && models.length > 0) create();
              }}
              placeholder="ex : meilleure cafetière à grain"
              className="input"
              autoFocus
              maxLength={500}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={create}
              disabled={!keyword.trim() || models.length === 0 || busy}
              className="btn-primary"
            >
              {busy ? (
                <>
                  <Icon name="spinner" size={14} />
                  Lancement…
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={14} />
                  Lancer le fan-out
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className="label">Pays (recherche web)</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="input"
            >
              {COUNTRIES_ISO.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.flag} {c.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="label">LLMs à interroger</span>
            <div className="flex flex-wrap gap-2">
              {ALL_MODELS.map((m) => {
                const active = models.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModel(m.id)}
                    className={`chip cursor-pointer transition ${
                      active
                        ? "border-accent-500/60 bg-accent-500/15 text-accent-100"
                        : "border-zinc-700 text-zinc-400 hover:text-zinc-100 bg-zinc-800/30"
                    }`}
                    title={m.hint}
                  >
                    {active && <Icon name="check" size={10} className="mr-1" />}
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-accent-400" />
          ~10-40 s d'analyse · {models.length} LLM{models.length > 1 ? "s" : ""} en parallèle · ≈ ${costEstimate.toFixed(3)} / fan-out
        </div>

        {err && (
          <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-3 text-sm flex items-start gap-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </section>

      <section className="space-y-3 animate-rise" style={{ animationDelay: "140ms" }}>
        <div className="flex items-center justify-between">
          <span className="label">Mes fan-outs</span>
          <span className="text-xs text-zinc-500 tabular-nums">
            {data ? `${data.length} au total` : "—"}
          </span>
        </div>

        {!data && <SkeletonList rows={3} />}

        {data && data.length === 0 && (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="sparkles" size={20} />
            </div>
            <div className="text-zinc-100 font-medium">
              Pas encore de fan-out
            </div>
            <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
              Lance un mot-clé pour voir ce que les LLM cherchent en coulisse
              et quelles sources ils citent.
            </p>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.map((it) => {
              const stat = STATUS[it.status];
              const modelChips = it.models.split(",").filter(Boolean);
              return (
                <Link
                  href={`/fan-out/${it.id}`}
                  key={it.id}
                  className="group relative card overflow-hidden card-hover p-0"
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px"
                    style={{
                      background:
                        it.status === "done"
                          ? "linear-gradient(90deg, transparent, rgba(16,185,129,0.7), transparent)"
                          : it.status === "running"
                          ? "linear-gradient(90deg, transparent, rgba(124,132,255,0.7), transparent)"
                          : it.status === "failed"
                          ? "linear-gradient(90deg, transparent, rgba(239,68,68,0.7), transparent)"
                          : "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
                    }}
                  />
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`chip ${stat.className}`}>
                        {it.status === "running" && (
                          <Icon name="spinner" size={10} className="mr-0.5" />
                        )}
                        {stat.label}
                      </span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          remove(it.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-300 transition-all"
                        title="Supprimer"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Mot-clé
                      </div>
                      <div className="font-semibold text-base text-zinc-100 mt-0.5 leading-tight line-clamp-2">
                        {it.keyword}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {modelChips.map((m) => (
                        <span
                          key={m}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700/60 text-zinc-400 bg-zinc-800/30"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 border-t border-[var(--border)] pt-2.5">
                      <span className="font-mono">
                        {it.country_iso || "—"}
                      </span>
                      <span className="tabular-nums">
                        ${it.cost.toFixed(3)}
                      </span>
                    </div>
                    {it.error && (
                      <div className="text-[10px] text-red-300/80 line-clamp-2">
                        {it.error}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
