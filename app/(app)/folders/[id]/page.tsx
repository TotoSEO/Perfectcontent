"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Content, Folder } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { FolderPicker } from "@/components/FolderPicker";
import { SkeletonList } from "@/components/Skeleton";

const STATUS_TONE: Record<string, string> = {
  analysis: "border-zinc-700 text-zinc-400 bg-zinc-800/40",
  generated: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  editing: "border-blue-700/50 text-blue-300 bg-blue-500/10",
  archived: "border-zinc-700 text-zinc-500 bg-zinc-800/30",
};
const STATUS_LABELS: Record<string, string> = {
  analysis: "Analyse",
  generated: "Généré",
  editing: "En édition",
  archived: "Archivé",
};
const TYPE_LABELS: Record<string, string> = {
  blog: "Blog",
  category: "Catégorie",
  product: "Produit",
  service_lp: "Service / LP",
};

export default function FolderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const folderId = params.id;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const { data: folder, mutate: refetchFolder } = useSWR<Folder>(
    folderId ? `/srv/folders/${folderId}` : null,
    fetcher,
  );
  const { data: contents, mutate: refetchContents } = useSWR<Content[]>(
    folderId ? `/srv/contents?folder_id=${folderId}` : null,
    fetcher,
  );

  async function rename() {
    if (!name.trim() || !folderId) return;
    await api(`/srv/folders/${folderId}`, {
      method: "PATCH",
      json: { name: name.trim() },
    });
    setEditing(false);
    refetchFolder();
  }

  async function remove() {
    if (!folderId) return;
    if (
      !confirm(
        "Supprimer ce dossier ? Les contenus à l'intérieur ne seront pas supprimés, juste détachés.",
      )
    )
      return;
    await api(`/srv/folders/${folderId}`, { method: "DELETE" });
    router.push("/folders");
  }

  return (
    <div className="space-y-7 animate-fadein">
      <div>
        <Link
          href="/folders"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <Icon name="arrow-left" size={11} />
          Tous les dossiers
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-2 flex items-center gap-2">
            <Icon name="folder" size={11} />
            Dossier
          </div>
          {!folder ? (
            <div className="h-8 w-72 skeleton" />
          ) : editing ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="input max-w-md"
                autoFocus
              />
              <button onClick={rename} className="btn-primary px-3 py-2 text-xs">
                <Icon name="check" size={12} />
                OK
              </button>
              <button
                onClick={() => setEditing(false)}
                className="btn-ghost px-3 py-2 text-xs"
              >
                Annuler
              </button>
            </div>
          ) : (
            <h1 className="h-page inline-flex items-center gap-2">
              {folder.name}
              <button
                onClick={() => {
                  setName(folder.name);
                  setEditing(true);
                }}
                className="btn-icon w-7 h-7"
                title="Renommer"
              >
                <Icon name="edit" size={12} />
              </button>
            </h1>
          )}
          <p className="h-sub">
            {contents
              ? `${contents.length} contenu${contents.length > 1 ? "s" : ""}`
              : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/new" className="btn-secondary px-3 py-2 text-xs">
            <Icon name="plus" size={12} />
            Nouveau contenu
          </Link>
          {folder && (
            <button
              onClick={remove}
              className="btn-danger px-3 py-2 text-xs"
              title="Supprimer ce dossier"
            >
              <Icon name="trash" size={12} />
              Supprimer
            </button>
          )}
        </div>
      </header>

      {!contents && <SkeletonList rows={4} />}

      {contents && contents.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="folder" size={20} />
          </div>
          <div className="text-zinc-100 font-medium">Dossier vide</div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
            Génère un contenu en sélectionnant ce dossier dans les paramètres avancés,
            ou range un contenu existant via le bouton « Ranger » sur le tableau de bord.
          </p>
        </div>
      )}

      {contents && contents.length > 0 && (
        <ul className="card divide-y divide-[var(--border)] overflow-hidden">
          {contents.map((c) => {
            const label = TYPE_LABELS[c.content_type] || c.content_type;
            const statusLabel = STATUS_LABELS[c.status] || c.status;
            return (
              <li key={c.id} className="relative group">
                <Link
                  href={`/contents/${c.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-[14px] text-zinc-100">
                      {c.chosen_title || c.keyword}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{label}</span>
                      {c.intent && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span>{c.intent}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      STATUS_TONE[c.status] || STATUS_TONE.analysis
                    }`}
                  >
                    {statusLabel}
                  </span>
                  {c.coverage_score != null && (
                    <span className="chip-soft tabular-nums">
                      {Number(c.coverage_score).toFixed(0)}%
                    </span>
                  )}
                </Link>
                <div className="absolute right-12 top-1/2 -translate-y-1/2">
                  <FolderPicker
                    contentId={c.id}
                    currentFolderId={c.folder_id}
                    onChange={() => refetchContents()}
                  />
                </div>
                <Icon
                  name="chevron-right"
                  size={14}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
