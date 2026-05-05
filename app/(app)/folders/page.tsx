"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";

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
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Dossiers</h1>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du dossier"
          className="flex-1 bg-ink-900 border border-ink-800 rounded px-3 py-2"
        />
        <select
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          className="bg-ink-900 border border-ink-800 rounded px-2"
        >
          <option value="">(racine)</option>
          {folders?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button className="bg-accent-600 hover:bg-accent-500 rounded px-4 py-2 text-sm">
          Créer
        </button>
      </form>

      <ul className="divide-y divide-ink-800 border border-ink-800 rounded-lg">
        {folders?.map((f) => (
          <li key={f.id} className="p-3 flex justify-between items-center">
            <span>
              {f.name}
              {f.parent_id ? <span className="text-zinc-500 text-xs ml-2">enfant</span> : null}
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
    </div>
  );
}
