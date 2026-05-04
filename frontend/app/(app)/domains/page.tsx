"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Domain } from "@/lib/types";
import { DomainProgress } from "@/components/DomainIndexProgress";

export default function DomainsPage() {
  const { data: domains, mutate } = useSWR<Domain[]>("/api/domains", fetcher, {
    refreshInterval: 5000,
  });
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!hostname.trim()) return;
    setBusy(true);
    try {
      await api("/api/domains", { method: "POST", json: { hostname } });
      setHostname("");
      mutate();
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
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Domaines indexés</h1>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="exemple.com"
          className="flex-1 bg-ink-900 border border-ink-800 rounded px-3 py-2"
        />
        <button
          disabled={busy}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 rounded px-4 py-2 text-sm"
        >
          Ajouter & indexer
        </button>
      </form>

      <ul className="space-y-3">
        {domains?.map((d) => (
          <li
            key={d.id}
            className="border border-ink-800 rounded-lg p-4 bg-ink-900/40 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{d.hostname}</div>
                <div className="text-xs text-zinc-500">
                  Statut: {d.status} · {d.pages_count} pages indexées · coût ${d.index_cost_usd}
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <button onClick={() => reindex(d.id)} className="text-accent-500 hover:underline">
                  Rafraîchir
                </button>
                <button onClick={() => remove(d.id)} className="text-red-400 hover:underline">
                  Supprimer
                </button>
              </div>
            </div>
            {(d.status === "indexing" || d.status === "pending") && <DomainProgress id={d.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
