"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Content, Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { SkeletonList } from "@/components/Skeleton";
import { Icon } from "@/components/Icon";

export default function FoldersPage() {
  const { data: folders, mutate } = useSWR<Folder[]>("/srv/folders", fetcher);
  const { data: allContents } = useSWR<Content[]>("/srv/contents", fetcher);

  const countByFolder = new Map<string, number>();
  (allContents || []).forEach((c) => {
    if (c.folder_id) {
      countByFolder.set(c.folder_id, (countByFolder.get(c.folder_id) || 0) + 1);
    }
  });
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
          {folders?.map((f) => {
            const count = countByFolder.get(f.id) || 0;
            return (
              <li key={f.id} className="relative group">
                <Link
                  href={`/folders/${f.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-white/[0.04] transition-colors"
                >
                  <span className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-9 h-9 rounded-lg bg-accent-500/10 border border-accent-500/25 flex items-center justify-center text-accent-300 shrink-0 group-hover:scale-105 group-hover:bg-accent-500/15 transition-all">
                      <Icon name="folder" size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-[14px] text-zinc-100 group-hover:text-white truncate block">
                        {f.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 mt-0.5 inline-flex items-center gap-1.5">
                        {count} contenu{count > 1 ? "s" : ""}
                        {f.parent_id && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span>sous-dossier</span>
                          </>
                        )}
                      </span>
                    </span>
                  </span>
                  <Icon
                    name="chevron-right"
                    size={14}
                    className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0"
                  />
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(f.id);
                  }}
                  className="absolute right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-300 transition-all p-1.5 rounded-md hover:bg-red-500/10"
                  title="Supprimer le dossier"
                >
                  <Icon name="trash" size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
