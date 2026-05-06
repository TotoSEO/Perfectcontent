"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { Icon } from "@/components/Icon";

/** Inline folder picker. Persists `folder_id` on the content via PATCH. */
export function FolderPicker({
  contentId,
  currentFolderId,
  onChange,
  className,
}: {
  contentId: string;
  currentFolderId: string | null;
  onChange?: (folderId: string | null) => void;
  className?: string;
}) {
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = folders?.find((f) => f.id === currentFolderId) || null;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function move(folderId: string | null) {
    if (folderId === currentFolderId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api(`/srv/contents/${contentId}`, {
        method: "PATCH",
        json: { folder_id: folderId },
      });
      onChange?.(folderId);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={busy}
        className={`chip ${
          current
            ? "border-accent-500/35 bg-accent-500/10 text-accent-100"
            : "text-zinc-400 hover:text-zinc-100 hover:border-white/20"
        } cursor-pointer transition-colors`}
        title={current ? `Dossier : ${current.name}` : "Ranger dans un dossier"}
      >
        <Icon name="folder" size={11} />
        <span className="truncate max-w-[140px]">
          {current ? current.name : "Ranger"}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-30 w-60 rounded-xl border border-white/[0.10] bg-[#10121a]/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] overflow-hidden animate-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500 border-b border-white/[0.06]">
            Ranger dans…
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              onClick={() => move(null)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                !currentFolderId
                  ? "text-accent-200 bg-accent-500/[0.08]"
                  : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              <Icon name="x" size={12} className="opacity-60" />
              Aucun
              {!currentFolderId && (
                <Icon name="check" size={12} className="ml-auto text-accent-300" />
              )}
            </button>
            {(folders || []).map((f) => (
              <button
                key={f.id}
                onClick={() => move(f.id)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  f.id === currentFolderId
                    ? "text-accent-200 bg-accent-500/[0.08]"
                    : "text-zinc-200 hover:bg-white/5"
                }`}
              >
                <Icon name="folder" size={12} className="opacity-70" />
                <span className="truncate flex-1">{f.name}</span>
                {f.id === currentFolderId && (
                  <Icon name="check" size={12} className="text-accent-300" />
                )}
              </button>
            ))}
            {folders && folders.length === 0 && (
              <div className="px-3 py-3 text-xs text-zinc-500">
                Aucun dossier. Crée-en un dans la rubrique Dossiers.
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pop {
          0% {
            opacity: 0;
            transform: translateY(-4px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-in {
          animation: pop 200ms cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: top right;
        }
      `}</style>
    </div>
  );
}
