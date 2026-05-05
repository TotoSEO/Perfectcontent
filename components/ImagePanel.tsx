"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export function ImagePanel({
  contentId,
  imageUrl,
  imagePrompt,
  onUpdate,
}: {
  contentId: string;
  imageUrl: string | null;
  imagePrompt: string | null;
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!imagePrompt && !imageUrl) {
    return (
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 text-sm text-zinc-500">
        Pas de prompt d'image généré pour ce contenu.
      </div>
    );
  }

  async function copy() {
    if (!imagePrompt) return;
    try {
      await navigator.clipboard.writeText(imagePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function generate(backend: "openai" | "fal") {
    setBusy(true);
    setErr(null);
    try {
      await api(`/srv/contents/${contentId}/generate-image?backend=${backend}`, {
        method: "POST",
      });
      onUpdate();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-wider text-zinc-500">
          Image illustrative
        </h3>
        {imageUrl && (
          <span className="text-[10px] text-emerald-300 uppercase tracking-wider">
            Générée
          </span>
        )}
      </div>

      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="w-full rounded-lg border border-ink-800"
        />
      )}

      {imagePrompt && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Prompt suggéré
            </span>
            <button
              onClick={copy}
              className="text-[10px] uppercase tracking-wider text-accent-500 hover:underline"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-zinc-300 bg-ink-800/60 border border-ink-800 rounded-lg p-3 font-mono whitespace-pre-wrap">
            {imagePrompt}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => generate("openai")}
          disabled={busy || !imagePrompt}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-3 py-1.5 rounded font-medium"
          title="Génère via OpenAI gpt-image-1, ~$0.04 par image"
        >
          {busy ? "Génération…" : "Générer (OpenAI)"}
        </button>
        <span className="text-zinc-500 text-[11px] self-center">
          ou copie le prompt et utilise ton outil préféré (gratuit).
        </span>
      </div>

      {err && (
        <div className="text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded p-2">
          {err}
        </div>
      )}
    </div>
  );
}
