"use client";

import { useState } from "react";
import { Blueprint, Section } from "@/lib/types";
import { Icon } from "@/components/Icon";

export function BlueprintEditor({
  initial,
  onSubmit,
  busy,
}: {
  initial: Blueprint;
  onSubmit: (bp: Blueprint) => void;
  busy: boolean;
}) {
  const [bp, setBp] = useState<Blueprint>(initial);

  function updateSection(idx: number, patch: Partial<Section>) {
    setBp({
      ...bp,
      sections: bp.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  }
  function removeSection(idx: number) {
    setBp({ ...bp, sections: bp.sections.filter((_, i) => i !== idx) });
  }
  function addSection() {
    setBp({
      ...bp,
      sections: [
        ...bp.sections,
        { id: `s${Date.now()}`, h2: "Nouvelle section", bullets: [] },
      ],
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
        <label className="space-y-1.5 block">
          <span className="label">Title</span>
          <input
            value={bp.title_target}
            onChange={(e) => setBp({ ...bp, title_target: e.target.value })}
            className="input"
          />
        </label>
        <label className="space-y-1.5 block">
          <span className="label">Cible (mots)</span>
          <input
            type="number"
            value={bp.target_words}
            onChange={(e) => setBp({ ...bp, target_words: Number(e.target.value) })}
            className="input tabular-nums"
          />
        </label>
      </div>

      <label className="space-y-1.5 block">
        <span className="label">Angle différenciant</span>
        <textarea
          value={bp.angle}
          onChange={(e) => setBp({ ...bp, angle: e.target.value })}
          className="input min-h-[64px] leading-relaxed"
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="label">Sections H2</h3>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {bp.sections.length} section{bp.sections.length > 1 ? "s" : ""}
          </span>
        </div>
        {bp.sections.map((s, i) => (
          <div key={s.id} className="card p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                value={s.h2}
                onChange={(e) => updateSection(i, { h2: e.target.value })}
                className="flex-1 min-w-[200px] bg-white/[0.04] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500"
              />
              <select
                value={s.element || ""}
                onChange={(e) =>
                  updateSection(i, { element: (e.target.value || undefined) as Section["element"] })
                }
                className="bg-white/[0.04] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500"
              >
                <option value="">prose</option>
                <option value="table">tableau</option>
                <option value="faq">FAQ</option>
                <option value="list">liste</option>
                <option value="callout">encadré</option>
              </select>
              <button
                onClick={() => removeSection(i)}
                className="btn-ghost px-2.5 py-1.5 text-xs hover:text-red-300 hover:bg-red-500/10"
                title="Supprimer la section"
                type="button"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            <textarea
              value={(s.bullets || []).join("\n")}
              onChange={(e) =>
                updateSection(i, { bullets: e.target.value.split("\n").filter(Boolean) })
              }
              placeholder="bullet points (un par ligne)"
              className="w-full bg-white/[0.04] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[64px] focus:outline-none focus:border-accent-500 leading-relaxed"
            />
          </div>
        ))}
        <button
          onClick={addSection}
          className="w-full text-sm text-accent-400 hover:text-accent-300 py-2 border border-dashed border-[var(--border)] hover:border-accent-500/40 hover:bg-accent-500/5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          type="button"
        >
          <Icon name="plus" size={14} />
          Ajouter une section
        </button>
      </div>

      <button
        disabled={busy}
        onClick={() => onSubmit(bp)}
        className="btn-primary w-full sm:w-auto"
        type="button"
      >
        {busy ? (
          <>
            <Icon name="spinner" size={14} /> Reprise…
          </>
        ) : (
          <>
            <Icon name="check" size={14} /> Valider et générer
          </>
        )}
      </button>
    </div>
  );
}
