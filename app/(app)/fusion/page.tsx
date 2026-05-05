"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { RichTextarea } from "@/components/RichTextarea";

type Estimate = { sources: number; chars_total: number; low: number; high: number };

type Source = { id: string; html: string };

function newSource(): Source {
  return { id: crypto.randomUUID(), html: "" };
}

export default function FusionPage() {
  const router = useRouter();
  const { data: folders } = useSWR<Folder[]>("/api/folders", fetcher);

  const [keyword, setKeyword] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([newSource(), newSource()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  const validSources = sources.filter((s) => s.html.trim().length > 50);

  useEffect(() => {
    if (validSources.length < 2) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/api/fusion/estimate", {
          method: "POST",
          json: { sources: validSources.map((s) => s.html) },
        });
        setEstimate(e);
      } catch {
        setEstimate(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validSources.map((s) => s.html.length).join(",")]);

  function setSrc(id: string, html: string) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, html } : s)));
  }
  function add() {
    setSources((p) => [...p, newSource()]);
  }
  function remove(id: string) {
    setSources((p) => (p.length > 2 ? p.filter((s) => s.id !== id) : p));
  }

  async function submit() {
    if (!keyword.trim() || validSources.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ content_id: string; cost: number }>("/api/fusion", {
        method: "POST",
        json: {
          keyword: keyword.trim(),
          folder_id: folderId || null,
          sources: validSources.map((s) => s.html),
        },
      });
      router.push(`/contents/${res.content_id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold inline-flex items-center">
          🧪 Fusion de contenus
          <HelpIcon
            side="right"
            content="Quand 2+ pages d'un site se cannibalisent sur le même mot-clé, fusionne-les en un seul contenu unifié sans répétitions. Pas une réécriture : une vraie synthèse intégrative."
          />
        </h1>
        <p className="text-sm text-zinc-500">
          Colle le contenu de chaque page (le rich text est préservé : titres,
          gras, tableaux, listes, citations).
        </p>
      </header>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-zinc-500 inline-flex items-center">
              Mot-clé cible
              <HelpIcon content="Le mot-clé pour lequel les contenus se cannibalisent et que la fusion doit conserver côté SEO." />
            </span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex: meilleure cafetière à grain"
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Dossier (optionnel)
            </span>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
            >
              <option value="">(aucun)</option>
              {folders?.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {sources.map((s, i) => (
          <div key={s.id} className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-zinc-500">
                Contenu {i + 1}
              </span>
              {sources.length > 2 && (
                <button
                  onClick={() => remove(s.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Retirer
                </button>
              )}
            </div>
            <RichTextarea
              value={s.html}
              onChange={(html) => setSrc(s.id, html)}
              minHeight={220}
              placeholder={`Colle ici le contenu de la page ${i + 1}…`}
            />
            <p className="text-[10px] text-zinc-600">
              {s.html.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length} mots
            </p>
          </div>
        ))}

        <button
          onClick={add}
          className="w-full text-sm text-accent-500 hover:bg-ink-900/50 py-2 border border-dashed border-ink-800 rounded-xl"
        >
          + Ajouter un autre contenu
        </button>
      </div>

      {err && (
        <div className="bg-red-900/30 border border-red-700 text-red-100 p-3 rounded-xl text-sm">
          {err}
        </div>
      )}

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex items-center justify-between gap-3 sticky bottom-3 backdrop-blur">
        <div className="text-sm">
          {validSources.length < 2 ? (
            <span className="text-zinc-500">
              Colle au moins 2 contenus (minimum ~50 caractères chacun) pour activer la fusion.
            </span>
          ) : (
            <>
              <div className="font-medium">
                {validSources.length} contenu{validSources.length > 1 ? "s" : ""} prêt{validSources.length > 1 ? "s" : ""} à fusionner
              </div>
              {estimate && (
                <div className="text-xs text-zinc-400 mt-0.5">
                  Estimation : <strong className="text-zinc-200">${estimate.low.toFixed(3)}</strong> – <strong className="text-zinc-200">${estimate.high.toFixed(3)}</strong>
                  <span className="text-zinc-600 ml-1">· {estimate.chars_total.toLocaleString()} caractères en entrée</span>
                </div>
              )}
            </>
          )}
        </div>
        <button
          disabled={!keyword.trim() || validSources.length < 2 || busy}
          onClick={submit}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-5 py-2.5 rounded font-medium text-sm shadow"
        >
          {busy ? "Fusion en cours…" : "Fusionner les contenus"}
        </button>
      </div>
    </div>
  );
}
