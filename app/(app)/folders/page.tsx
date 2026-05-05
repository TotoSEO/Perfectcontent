"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { SkeletonList } from "@/components/Skeleton";

export default function FoldersPage() {
  const { data: folders, mutate } = useSWR<Folder[]>("/srv/folders", fetcher);
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/srv/folders", {
        method: "POST",
        json: { name, parent_id: parent || null },
      });
      setName("");
      mutate();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce dossier ?")) return;
    await api(`/srv/folders/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-8 max-w-3xl animate-fadein">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight inline-flex items-center">
          Dossiers
          <HelpIcon
            side="right"
            content="Crée un dossier par client ou projet. Lors d'un nouveau lot, choisis-le pour ranger automatiquement les contenus produits."
          />
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Organisation simple par client / projet / thématique.
        </p>
      </header>

      <form onSubmit={add} className="card p-5 grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <div>
          <label className="label block mb-1.5">Nom du dossier</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Client Acme — Q1"
            className="input"
          />
        </div>
        <div>
          <label className="label block mb-1.5">Parent</label>
          <select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            className="input"
          >
            <option value="">(racine)</option>
            {folders?.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <button disabled={!name.trim() || busy} className="btn-primary">
          {busy ? "…" : "Créer"}
        </button>
      </form>
      {err && (
        <div className="text-xs text-red-300 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {!folders && <SkeletonList rows={3} />}

      {folders && folders.length === 0 && (
        <div className="card p-12 text-center space-y-3 border-dashed">
          <div className="mx-auto w-10 h-10 rounded-xl bg-accent-600/10 border border-accent-500/30 flex items-center justify-center text-accent-400 text-lg">
            ▫
          </div>
          <div className="text-zinc-200 font-medium">Aucun dossier</div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            L'outil marche très bien sans, mais c'est utile dès que tu gères plusieurs clients.
          </p>
        </div>
      )}

      {(folders || []).length > 0 && (
        <ul className="card divide-y divide-[#1f1f24] overflow-hidden">
          {folders?.map((f) => (
            <li
              key={f.id}
              className="px-5 py-3 flex items-center justify-between hover:bg-[#1a1a1e] transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="text-zinc-600 text-sm">▫</span>
                <span className="font-medium text-[14px]">{f.name}</span>
                {f.parent_id && (
                  <span className="chip border-[#2c2c32] text-zinc-500">enfant</span>
                )}
              </span>
              <button onClick={() => remove(f.id)} className="btn-danger px-3 py-1.5 text-xs">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
