"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { SkeletonList } from "@/components/Skeleton";
import { Icon } from "@/components/Icon";

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
        <div className="eyebrow mb-2">Bibliothèque</div>
        <h1 className="h-page inline-flex items-center">
          Dossiers
          <HelpIcon
            side="right"
            content="Crée un dossier par client ou projet. Lors d'un nouveau lot, choisis-le pour ranger automatiquement les contenus produits."
          />
        </h1>
        <p className="h-sub">Organisation simple par client / projet / thématique.</p>
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
          {busy ? <Icon name="spinner" size={14} /> : <Icon name="plus" size={14} />}
          Créer
        </button>
      </form>
      {err && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-700/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {!folders && <SkeletonList rows={3} />}

      {folders && folders.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="folder" size={20} />
          </div>
          <div className="text-zinc-100 font-medium">Aucun dossier</div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
            L'outil marche très bien sans, mais c'est utile dès que tu gères plusieurs clients.
          </p>
        </div>
      )}

      {(folders || []).length > 0 && (
        <ul className="card divide-y divide-[var(--border)] overflow-hidden">
          {folders?.map((f) => (
            <li
              key={f.id}
              className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon name="folder" size={16} className="text-zinc-500 shrink-0" />
                <span className="font-medium text-[14px] text-zinc-100 truncate">{f.name}</span>
                {f.parent_id && <span className="chip-soft">enfant</span>}
              </span>
              <button
                onClick={() => remove(f.id)}
                className="btn-danger px-3 py-1.5 text-xs"
                title="Supprimer le dossier"
              >
                <Icon name="trash" size={12} />
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
