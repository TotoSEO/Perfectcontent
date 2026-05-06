"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

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
      <div className="card p-4 text-sm text-zinc-500">
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
    <div className="card overflow-hidden">
      <div className="card-section">
        <h3 className="label inline-flex items-center gap-1.5">
          <Icon name="image" size={14} className="text-zinc-500" />
          Image illustrative
        </h3>
        {imageUrl && <span className="chip-ok">générée</span>}
      </div>

      <div className="p-4 space-y-3">
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt=""
            className="w-full rounded-lg border border-[var(--border)]"
          />
        )}

        {imagePrompt && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="label">Prompt suggéré</span>
              <button
                onClick={copy}
                className="text-[11px] text-accent-400 hover:text-accent-300 inline-flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Icon name="check" size={12} /> Copié
                  </>
                ) : (
                  <>
                    <Icon name="copy" size={12} /> Copier
                  </>
                )}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-300 bg-white/[0.04] border border-[var(--border)] rounded-lg p-3 font-mono whitespace-pre-wrap">
              {imagePrompt}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => generate("openai")}
            disabled={busy || !imagePrompt}
            className="btn-primary px-3 py-2 text-xs"
            title="Génère via OpenAI gpt-image-1, ~$0.04 par image"
          >
            {busy ? (
              <>
                <Icon name="spinner" size={12} /> Génération…
              </>
            ) : (
              <>
                <Icon name="sparkles" size={12} /> Générer (OpenAI)
              </>
            )}
          </button>
          <span className="text-zinc-500 text-[11px]">
            ou copie le prompt et utilise ton outil préféré.
          </span>
        </div>

        {err && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-700/40 rounded-lg p-2">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
