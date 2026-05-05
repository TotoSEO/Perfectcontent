"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Domain } from "@/lib/types";
import { DomainProgress } from "@/components/DomainIndexProgress";
import { HelpIcon } from "@/components/Tooltip";
import { SkeletonList } from "@/components/Skeleton";

const STATUS_TONE: Record<string, string> = {
  pending: "border-zinc-700 text-zinc-400 bg-zinc-800/40",
  indexing: "border-accent-500/40 text-accent-300 bg-accent-500/10",
  ready: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  error: "border-red-700/50 text-red-300 bg-red-500/10",
};

export default function DomainsPage() {
  const { data: domains, mutate } = useSWR<Domain[]>("/srv/domains", fetcher, {
    refreshInterval: 5000,
  });
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!hostname.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/srv/domains", { method: "POST", json: { hostname } });
      setHostname("");
      mutate();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reindex(id: string) {
    await api(`/srv/domains/${id}/reindex`, { method: "POST" });
    mutate();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce domaine et son index ?")) return;
    await api(`/srv/domains/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-8 max-w-4xl animate-fadein">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight inline-flex items-center">
          Domaines indexés
          <HelpIcon
            side="right"
            content="On lit le robots.txt + sitemap d'un domaine, on scrape ses pages, et on les embedde. Au moment d'une génération, si tu choisis ce domaine, on insérera des liens internes vers les pages les plus pertinentes."
          />
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Active le maillage interne automatique sur tes contenus en indexant un domaine.
        </p>
      </header>

      <form onSubmit={add} className="card p-5 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="label inline-flex items-center mb-1.5">
            Hostname
            <HelpIcon content="Juste le nom de domaine, sans http:// ni /. Ex : monsite.com" />
          </label>
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="exemple.com"
            className="input"
          />
        </div>
        <button disabled={busy || !hostname.trim()} className="btn-primary">
          {busy ? "Ajout…" : "Indexer ce domaine"}
        </button>
      </form>
      {err && (
        <div className="text-xs text-red-300 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {!domains && <SkeletonList rows={3} />}

      {domains && domains.length === 0 && (
        <div className="card p-12 text-center space-y-3 border-dashed">
          <div className="mx-auto w-10 h-10 rounded-xl bg-accent-600/10 border border-accent-500/30 flex items-center justify-center text-accent-400 text-lg">
            ◇
          </div>
          <div className="text-zinc-200 font-medium">Aucun domaine indexé</div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Sans domaine, tu peux quand même générer du contenu — tu n'auras juste
            pas le maillage interne automatique.
          </p>
        </div>
      )}

      {(domains || []).length > 0 && (
        <ul className="space-y-3">
          {domains?.map((d) => (
            <li key={d.id} className="card card-hover p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate text-[15px]">{d.hostname}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {d.pages_count} pages indexées · coût ${Number(d.index_cost_usd).toFixed(4)}
                    {d.last_indexed_at && (
                      <> · MàJ {new Date(d.last_indexed_at).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`chip ${STATUS_TONE[d.status] || STATUS_TONE.pending}`}>
                    {d.status}
                  </span>
                  <button
                    onClick={() => reindex(d.id)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                    title="Re-crawler le domaine"
                  >
                    Rafraîchir
                  </button>
                  <button
                    onClick={() => remove(d.id)}
                    className="btn-danger px-3 py-1.5 text-xs"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              {(d.status === "indexing" || d.status === "pending") && (
                <DomainProgress id={d.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
