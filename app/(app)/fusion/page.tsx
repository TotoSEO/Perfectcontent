"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Folder } from "@/lib/types";
import { HelpIcon } from "@/components/Tooltip";
import { RichTextarea } from "@/components/RichTextarea";
import { Icon } from "@/components/Icon";

type Estimate = { sources: number; chars_total: number; low: number; high: number };

type Source = { id: string; html: string };

function newSource(): Source {
  return { id: crypto.randomUUID(), html: "" };
}

export default function FusionPage() {
  const router = useRouter();
  const { data: folders } = useSWR<Folder[]>("/srv/folders", fetcher);

  const [keyword, setKeyword] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([newSource(), newSource()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from the duplication detector hand-off. The cannibalization
  // page stores a JSON {sources: string[]} in sessionStorage before
  // routing here, so the user lands with both contents already pasted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("fusion-prefill");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.sources) && data.sources.length >= 2) {
        const next = data.sources
          .filter((h: unknown): h is string => typeof h === "string")
          .map((html: string) => ({ id: crypto.randomUUID(), html }));
        if (next.length >= 2) {
          setSources(next);
          setPrefilled(true);
        }
      }
    } catch {
      /* ignore malformed payload */
    }
    window.sessionStorage.removeItem("fusion-prefill");
  }, []);

  const validSources = sources.filter((s) => s.html.trim().length > 50);

  useEffect(() => {
    if (validSources.length < 2) {
      setEstimate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const e = await api<Estimate>("/srv/fusion/estimate", {
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
      const res = await api<{ content_id: string; cost: number }>("/srv/fusion", {
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
    <div className="page-shell space-y-6 animate-fadein">
      <header>
        <div className="eyebrow mb-2">Création</div>
        <h1 className="h-page inline-flex items-center gap-2">
          <Icon name="fusion" size={24} className="text-accent-400" />
          Fusion de contenus
          <HelpIcon
            side="right"
            content="Quand 2+ pages d'un site se cannibalisent sur le même mot-clé, fusionne-les en un seul contenu unifié sans répétitions. Pas une réécriture : une vraie synthèse intégrative."
          />
        </h1>
        <p className="h-sub max-w-2xl">
          Colle le contenu de chaque page (le rich text est préservé : titres,
          gras, tableaux, listes, citations).
        </p>
      </header>

      {prefilled && (
        <div className="card border-accent-500/30 bg-accent-500/[0.05] px-4 py-2.5 inline-flex items-center gap-2 text-xs text-accent-100">
          <Icon name="check" size={11} />
          Contenus pré-remplis depuis la détection de duplication.
        </div>
      )}

      <section className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className="label inline-flex items-center">
              Mot-clé cible
              <HelpIcon content="Le mot-clé pour lequel les contenus se cannibalisent et que la fusion doit conserver côté SEO." />
            </span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex: meilleure cafetière à grain"
              className="input"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="label">Dossier (optionnel)</span>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="input"
            >
              <option value="">(aucun)</option>
              {folders?.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Sources side by side. Two-column on lg+, single column below so
          mobile / narrow screens still get full-width editors. The dashed
          "+ Ajouter" button below sits across both columns. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sources.map((s, i) => {
          const words = s.html.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length;
          return (
            <div key={s.id} className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="label inline-flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-white/[0.04] border border-[var(--border)] inline-flex items-center justify-center text-[10px] text-zinc-300 tabular-nums">
                    {i + 1}
                  </span>
                  Contenu {i + 1}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-500 tabular-nums">{words} mots</span>
                  {sources.length > 2 && (
                    <button
                      onClick={() => remove(s.id)}
                      className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                    >
                      <Icon name="x" size={12} /> Retirer
                    </button>
                  )}
                </div>
              </div>
              <RichTextarea
                value={s.html}
                onChange={(html) => setSrc(s.id, html)}
                minHeight={220}
                placeholder={`Colle ici le contenu de la page ${i + 1}…`}
              />
            </div>
          );
        })}

        <button
          onClick={add}
          className="lg:col-span-2 w-full text-sm text-accent-400 hover:text-accent-300 py-2.5 border border-dashed border-[var(--border)] hover:border-accent-500/40 hover:bg-accent-500/5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="plus" size={14} />
          Ajouter un autre contenu
        </button>
      </div>

      {err && (
        <div className="card border-red-700/50 bg-red-500/10 text-red-200 p-3 text-sm flex items-start gap-2">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="card-elevated p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-3 backdrop-blur-md">
        <div className="text-sm">
          {validSources.length < 2 ? (
            <span className="text-zinc-500">
              Colle au moins 2 contenus (minimum ~50 caractères chacun) pour activer la fusion.
            </span>
          ) : (
            <>
              <div className="font-medium text-zinc-100">
                {validSources.length} contenu{validSources.length > 1 ? "s" : ""} prêt{validSources.length > 1 ? "s" : ""} à fusionner
              </div>
              {estimate && (
                <div className="text-xs text-zinc-400 mt-0.5">
                  Estimation :{" "}
                  <strong className="text-zinc-200 tabular-nums">${estimate.low.toFixed(3)}</strong>
                  {" – "}
                  <strong className="text-zinc-200 tabular-nums">${estimate.high.toFixed(3)}</strong>
                  <span className="text-zinc-600 ml-1.5">· {estimate.chars_total.toLocaleString()} car. en entrée</span>
                </div>
              )}
            </>
          )}
        </div>
        <button
          disabled={!keyword.trim() || validSources.length < 2 || busy}
          onClick={submit}
          className="btn-primary"
        >
          {busy ? (
            <>
              <Icon name="spinner" size={14} /> Fusion…
            </>
          ) : (
            <>
              <Icon name="fusion" size={14} /> Fusionner les contenus
            </>
          )}
        </button>
      </div>
    </div>
  );
}
