"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";

export default function FoldersPage() {
  const { data: folders, mutate } = useSWR<Folder[]>("/api/folders", fetcher);
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api("/api/folders", {
      method: "POST",
      json: { name, parent_id: parent || null },
    });
    setName("");
    mutate();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce dossier ?")) return;
    await api(`/api/folders/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold inline-flex items-center">
          📁 Dossiers
          <HelpIcon
            side="right"
            content="Crée un dossier par client ou projet. Lors d'un nouveau lot, choisis-le pour ranger automatiquement les contenus produits."
          />
        </h1>
        <p className="text-sm text-zinc-500">
          Une organisation simple par client / projet / thématique.
        </p>
      </header>

      <form
        onSubmit={add}
        className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Nom du dossier
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Client Acme — Q1"
            className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
            Parent
          </label>
          <select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 min-w-[160px]"
          >
            <option value="">(racine)</option>
            {folders?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <button
          disabled={!name.trim()}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium"
        >
          Créer
        </button>
      </form>

      {!folders && <p className="text-sm text-zinc-500">Chargement…</p>}
      {folders && folders.length === 0 && (
        <div className="border border-dashed border-ink-800 rounded-2xl p-10 text-center space-y-2">
          <div className="text-4xl">📁</div>
          <p className="text-zinc-300">Aucun dossier pour l'instant.</p>
          <p className="text-zinc-500 text-sm">
            Optionnel — l'outil marche très bien sans, mais c'est utile dès que tu
            gères plusieurs clients.
          </p>
        </div>
      )}

      {(folders || []).length > 0 && (
        <ul className="divide-y divide-ink-800 border border-ink-800 rounded-xl bg-ink-900/40 overflow-hidden">
          {folders?.map((f) => (
            <li
              key={f.id}
              className="p-3 flex justify-between items-center hover:bg-ink-800/40 transition"
            >
              <span className="flex items-center gap-2">
                <span>📁</span>
                <span className="font-medium">{f.name}</span>
                {f.parent_id && (
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-ink-800 rounded">
                    enfant
                  </span>
                )}
              </span>
              <button
                onClick={() => remove(f.id)}
                className="text-red-400 text-xs hover:underline"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
