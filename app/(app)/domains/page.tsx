"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Domain } from "@/lib/types";
import { DomainProgress } from "@/components/DomainIndexProgress";
import { HelpIcon } from "@/components/Tooltip";
import { SkeletonList } from "@/components/Skeleton";
import { Icon } from "@/components/Icon";

const STATUS_TONE: Record<string, string> = {
  pending: "border-zinc-700 text-zinc-400 bg-zinc-800/40",
  indexing: "border-accent-500/40 text-accent-300 bg-accent-500/10",
  ready: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  error: "border-red-700/50 text-red-300 bg-red-500/10",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  indexing: "Indexation",
  ready: "Prêt",
  error: "Erreur",
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
        <div className="eyebrow mb-2">Système</div>
        <h1 className="h-page inline-flex items-center">
          Domaines indexés
          <HelpIcon
            side="right"
            content="On lit le robots.txt + sitemap d'un domaine, on scrape ses pages, et on les embedde. Au moment d'une génération, si tu choisis ce domaine, on insérera des liens internes vers les pages les plus pertinentes."
          />
        </h1>
        <p className="h-sub">
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
          {busy ? (
            <>
              <Icon name="spinner" size={14} /> Ajout…
            </>
          ) : (
            <>
              <Icon name="plus" size={14} /> Indexer ce domaine
            </>
          )}
        </button>
      </form>
      {err && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-700/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {!domains && <SkeletonList rows={3} />}

      {domains && domains.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="globe" size={20} />
          </div>
          <div className="text-zinc-100 font-medium">Aucun domaine indexé</div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
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
                <div className="min-w-0 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#13141a] border border-[var(--border)] flex items-center justify-center text-zinc-400 shrink-0">
                    <Icon name="globe" size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium truncate text-[15px] text-zinc-100">{d.hostname}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                      {d.pages_count} pages · ${Number(d.index_cost_usd).toFixed(4)}
                      {d.last_indexed_at && (
                        <> · MàJ {new Date(d.last_indexed_at).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`chip ${STATUS_TONE[d.status] || STATUS_TONE.pending}`}>
                    {STATUS_LABELS[d.status] || d.status}
                  </span>
                  <button
                    onClick={() => reindex(d.id)}
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    title="Re-crawler le domaine"
                  >
                    <Icon name="refresh" size={12} />
                    Rafraîchir
                  </button>
                  <button
                    onClick={() => remove(d.id)}
                    className="btn-danger px-2.5 py-1.5 text-xs"
                    title="Supprimer"
                  >
                    <Icon name="trash" size={12} />
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
