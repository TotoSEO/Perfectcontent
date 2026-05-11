"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

type PromptStep = {
  system: string;
  user: string;
  model: string;
  cost: number | null;
  system_chars: number;
  user_chars: number;
};

type PromptsResponse = {
  job_id: string | null;
  mode: string | null;
  prompts: Record<string, PromptStep>;
};

const STEP_LABELS: Record<string, string> = {
  analyze: "Analyse SERP",
  blueprint: "Blueprint",
  generate: "Génération",
};

export function PromptViewerButton({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 hover:text-white"
        title="Voir les prompts envoyés à Claude"
      >
        Prompts
      </button>
      {open && <PromptModal contentId={contentId} onClose={() => setOpen(false)} />}
    </>
  );
}

function PromptModal({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const { data, error } = useSWR<PromptsResponse>(
    `/srv/contents/${contentId}/prompts`,
    fetcher,
  );
  const [active, setActive] = useState<string>("generate");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = Object.keys(data?.prompts || {});
  const current = data?.prompts[active] || (steps[0] ? data?.prompts[steps[0]] : undefined);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 lg:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[95vh] sm:max-h-[92vh] flex flex-col card overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-[#25252a] flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Prompts envoyés à Claude</h3>
            {data?.mode && (
              <span className="chip border-[#34343b] text-zinc-400 bg-[#0e0e11]">
                mode : {data.mode}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>

        {error && (
          <div className="p-5 text-sm text-red-300">Erreur : {String(error)}</div>
        )}

        {!data && !error && (
          <div className="p-10 text-sm text-zinc-500 text-center">Chargement…</div>
        )}

        {data && steps.length === 0 && (
          <div className="p-10 text-sm text-zinc-500 text-center">
            Aucun prompt enregistré. Les prompts ne sont capturés qu'à partir des
            jobs lancés après la mise à jour. Relance une génération pour voir.
          </div>
        )}

        {data && steps.length > 0 && (
          <>
            <div className="flex border-b border-[#25252a] bg-[#0e0e11] overflow-x-auto">
              {steps.map((s) => (
                <button
                  key={s}
                  onClick={() => setActive(s)}
                  className={`px-4 py-2.5 text-xs uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 ${
                    (active === s || (active === "generate" && !steps.includes("generate") && s === steps[0]))
                      ? "border-accent-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {STEP_LABELS[s] || s}
                </button>
              ))}
            </div>

            {current && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Stat label="Modèle" value={current.model} />
                  <Stat label="Tokens approx" value={`~${Math.round((current.system_chars + current.user_chars) / 4)}`} />
                  <Stat label="System (car.)" value={current.system_chars.toLocaleString("fr-FR")} />
                  <Stat label="Coût ($)" value={current.cost != null ? current.cost.toFixed(4) : "—"} />
                </div>

                <PromptBlock label="System" text={current.system} />
                <PromptBlock label="User" text={current.user} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <button
          onClick={copy}
          className="text-xs text-zinc-500 hover:text-zinc-200"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <pre className="text-[12px] leading-relaxed bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 max-h-[40vh] overflow-auto whitespace-pre-wrap font-mono text-zinc-300">
        {text}
      </pre>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}
