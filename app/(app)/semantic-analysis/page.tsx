"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { CountryPicker } from "@/components/CountryPicker";
import { SkeletonList } from "@/components/Skeleton";

type Item = {
  id: string;
  keyword: string;
  location_code: number;
  language_code: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  cost: number;
  created_at: string;
  updated_at: string;
};

const STATUS: Record<Item["status"], { label: string; className: string }> = {
  queued: { label: "En attente", className: "border-zinc-700 text-zinc-400 bg-zinc-800/40" },
  running: { label: "Analyse…", className: "border-blue-700/50 text-blue-300 bg-blue-500/10" },
  done: { label: "Prête", className: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10" },
  failed: { label: "Échec", className: "border-red-700/50 text-red-300 bg-red-500/10" },
};

export default function SemanticAnalysisListPage() {
  const router = useRouter();
  const { data, mutate } = useSWR<Item[]>("/srv/semantic-analyses", fetcher, {
    refreshInterval: 4000,
  });

  const [keyword, setKeyword] = useState("");
  const [locationCode, setLocationCode] = useState(2250);
  const [languageCode, setLanguageCode] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!keyword.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await api<Item>("/srv/semantic-analyses", {
        method: "POST",
        json: {
          keyword: keyword.trim(),
          location_code: locationCode,
          language_code: languageCode,
        },
      });
      // Trigger the pipeline asynchronously — the user goes to the detail
      // page where they'll see the running state.
      setKeyword("");
      mutate();
      // Fire-and-forget the pipeline run in the background; the detail page
      // keeps polling via SWR.
      api(`/srv/semantic-analyses/${created.id}/run`, { method: "POST" }).catch(() => {});
      router.push(`/semantic-analysis/${created.id}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette analyse ?")) return;
    await api(`/srv/semantic-analyses/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="page-shell space-y-7">
      <header className="animate-rise">
        <div className="eyebrow mb-2 inline-flex items-center gap-2">
          <Icon name="audit" size={11} />
          Optimisation
        </div>
        <h1 className="h-page">Analyse sémantique</h1>
        <p className="h-sub max-w-2xl">
          Donne un mot-clé, on analyse la SERP entière (BM25 + n-grams + entités)
          et on te livre les 40 termes à viser. Tu colles ton contenu et le
          graphe te dit en direct si tu es sous-optimisé, en bonne zone, en
          sur-optimisation ou en danger.
        </p>
      </header>

      {/* Creation form */}
      <section
        className="card p-5 space-y-4 animate-rise"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="label block mb-1.5">Mot-clé à analyser</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) create();
              }}
              placeholder="ex : meilleure cafetière à grain"
              className="input"
              autoFocus
            />
          </div>
          <div className="flex items-end">
            <button onClick={create} disabled={!keyword.trim() || busy} className="btn-primary">
              {busy ? (
                <>
                  <Icon name="spinner" size={14} />
                  Lancement…
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={14} />
                  Lancer l'analyse
                </>
              )}
            </button>
          </div>
        </div>

        <CountryPicker
          countryCode={locationCode}
          languageCode={languageCode}
          onChange={(c, l) => {
            setLocationCode(c);
            setLanguageCode(l);
          }}
        />

        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-accent-400" />
          ~30-90 s d'analyse · SERP top-7 + BM25 sur 40 termes · ≈ $0.02 / analyse
        </div>

        {err && (
          <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-3 text-sm flex items-start gap-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </section>

      {/* Existing analyses — keyword-first tile grid (different from contents) */}
      <section className="space-y-3 animate-rise" style={{ animationDelay: "140ms" }}>
        <div className="flex items-center justify-between">
          <span className="label">Mes analyses</span>
          <span className="text-xs text-zinc-500 tabular-nums">
            {data ? `${data.length} au total` : "—"}
          </span>
        </div>

        {!data && <SkeletonList rows={3} />}

        {data && data.length === 0 && (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="audit" size={20} />
            </div>
            <div className="text-zinc-100 font-medium">
              Pas encore d'analyse sémantique
            </div>
            <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
              Tape un mot-clé ci-dessus pour générer la première. La liste des
              termes BM25 reste valable plusieurs jours, donc tu peux y revenir
              et reprendre la rédaction quand tu veux.
            </p>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.map((it) => {
              const stat = STATUS[it.status];
              return (
                <Link
                  href={`/semantic-analysis/${it.id}`}
                  key={it.id}
                  className="group relative card overflow-hidden card-hover p-0"
                >
                  {/* Top accent line keyed to status */}
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
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 border-t border-[var(--border)] pt-2.5">
                      <span className="font-mono">
                        {it.language_code.toUpperCase()} · {it.location_code}
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
