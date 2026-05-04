"use client";

import { useState } from "react";
import { Blueprint, Section } from "@/lib/types";

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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Title</span>
          <input
            value={bp.title_target}
            onChange={(e) => setBp({ ...bp, title_target: e.target.value })}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            Cible (mots)
          </span>
          <input
            type="number"
            value={bp.target_words}
            onChange={(e) => setBp({ ...bp, target_words: Number(e.target.value) })}
            className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2"
          />
        </label>
      </div>

      <label className="space-y-1 block">
        <span className="text-xs uppercase tracking-wider text-zinc-500">
          Angle différenciant
        </span>
        <textarea
          value={bp.angle}
          onChange={(e) => setBp({ ...bp, angle: e.target.value })}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 min-h-[60px]"
        />
      </label>

      <div className="space-y-3">
        <h3 className="text-sm uppercase tracking-wider text-zinc-500">Sections</h3>
        {bp.sections.map((s, i) => (
          <div key={s.id} className="border border-ink-800 rounded p-3 space-y-2">
            <div className="flex justify-between gap-2">
              <input
                value={s.h2}
                onChange={(e) => updateSection(i, { h2: e.target.value })}
                className="flex-1 bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm"
              />
              <select
                value={s.element || ""}
                onChange={(e) =>
                  updateSection(i, { element: (e.target.value || undefined) as Section["element"] })
                }
                className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm"
              >
                <option value="">prose</option>
                <option value="table">tableau</option>
                <option value="faq">FAQ</option>
                <option value="list">liste</option>
                <option value="callout">encadré</option>
              </select>
              <button
                onClick={() => removeSection(i)}
                className="text-red-400 text-xs hover:underline"
              >
                Suppr.
              </button>
            </div>
            <textarea
              value={(s.bullets || []).join("\n")}
              onChange={(e) =>
                updateSection(i, { bullets: e.target.value.split("\n").filter(Boolean) })
              }
              placeholder="bullet points (un par ligne)"
              className="w-full bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm min-h-[60px]"
            />
          </div>
        ))}
        <button
          onClick={addSection}
          className="text-sm text-accent-500 hover:underline"
        >
          + Ajouter une section
        </button>
      </div>

      <button
        disabled={busy}
        onClick={() => onSubmit(bp)}
        className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 px-4 py-2 rounded font-medium"
      >
        {busy ? "Reprise…" : "Valider et générer"}
      </button>
    </div>
  );
}
