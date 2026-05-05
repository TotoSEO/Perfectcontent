"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Domain } from "@/lib/types";
import { DomainProgress } from "@/components/DomainIndexProgress";
import { HelpIcon } from "@/components/Tooltip";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-ink-800 text-zinc-400 border-ink-700",
  indexing: "bg-accent-500/20 text-accent-100 border-accent-500",
  ready: "bg-emerald-700/30 text-emerald-200 border-emerald-700",
  error: "bg-red-800/30 text-red-200 border-red-700",
};

export default function DomainsPage() {
  const { data: domains, mutate } = useSWR<Domain[]>("/api/domains", fetcher, {
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
      await api("/api/domains", { method: "POST", json: { hostname } });
      setHostname("");
      mutate();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reindex(id: string) {
    await api(`/api/domains/${id}/reindex`, { method: "POST" });
    mutate();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce domaine et son index ?")) return;
    await api(`/api/domains/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold inline-flex items-center">
          🌐 Domaines indexés
          <HelpIcon
            side="right"
            content="On lit le robots.txt + sitemap d'un domaine, on scrape ses pages, et on les embedde dans la base. Au moment d'une génération, si tu choisis ce domaine et actives le maillage, on insérera des liens internes vers les pages les plus pertinentes."
          />
        </h1>
        <p className="text-sm text-zinc-500">
          Ajoute un domaine pour activer le maillage interne automatique sur tes contenus.
        </p>
      </header>

      <form
        onSubmit={add}
        className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[240px]">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 inline-flex items-center mb-1">
            Hostname
            <HelpIcon content="Juste le nom de domaine, sans http:// ni /. Ex: monsite.com" />
          </label>
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="exemple.com"
            className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500"
          />
        </div>
        <button
          disabled={busy || !hostname.trim()}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium"
        >
          {busy ? "Ajout…" : "Ajouter & indexer"}
        </button>
      </form>
      {err && <div className="text-sm text-red-400">{err}</div>}

      {!domains && <p className="text-sm text-zinc-500">Chargement…</p>}
      {domains && domains.length === 0 && (
        <div className="border border-dashed border-ink-800 rounded-2xl p-10 text-center space-y-2">
          <div className="text-4xl">🌐</div>
          <p className="text-zinc-300">Aucun domaine indexé.</p>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Sans domaine, tu peux quand même générer du contenu — tu n'auras juste pas le
            maillage interne automatique.
          </p>
        </div>
      )}

      {(domains || []).length > 0 && (
        <ul className="space-y-3">
          {domains?.map((d) => (
            <li
              key={d.id}
              className="border border-ink-800 rounded-xl p-4 bg-ink-900/40 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.hostname}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {d.pages_count} pages indexées · coût $
                    {Number(d.index_cost_usd).toFixed(4)}
                    {d.last_indexed_at
                      ? ` · ${new Date(d.last_indexed_at).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] border rounded-full px-2 py-0.5 ${
                      STATUS_TONE[d.status] || STATUS_TONE.pending
                    }`}
                  >
                    {d.status}
                  </span>
                  <button
                    onClick={() => reindex(d.id)}
                    title="Re-crawler le domaine et regénérer l'index"
                    className="text-xs text-accent-500 hover:underline"
                  >
                    Rafraîchir
                  </button>
                  <button
                    onClick={() => remove(d.id)}
                    className="text-xs text-red-400 hover:underline"
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
