"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

type Sec = { id: string; heading: string };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

export function extractSections(html: string): Sec[] {
  if (!html) return [];
  if (typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: Sec[] = [];
  doc.querySelectorAll("h2").forEach((h2) => {
    const heading = h2.textContent?.trim() || "";
    const id = h2.getAttribute("id") || slugify(heading);
    if (heading) out.push({ id, heading });
  });
  return out;
}

export function SectionList({
  html,
  onRegenerate,
}: {
  html: string;
  onRegenerate: (sectionId: string) => Promise<void>;
}) {
  const sections = useMemo(() => extractSections(html), [html]);
  const [busy, setBusy] = useState<string | null>(null);

  if (sections.length === 0) {
    return (
      <div className="card p-4 text-sm text-zinc-500">
        Aucune section H2 détectée.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="card-section">
        <h3 className="label">Sections H2</h3>
        <span className="text-[11px] text-zinc-500 tabular-nums">{sections.length}</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {sections.map((s, i) => (
          <li key={s.id} className="flex justify-between items-center gap-2 px-4 py-2.5 hover:bg-white/[0.04] transition-colors">
            <span className="text-zinc-200 text-sm flex items-center gap-2 min-w-0">
              <span className="text-zinc-600 tabular-nums text-[11px]">{String(i + 1).padStart(2, "0")}</span>
              <span className="truncate">{s.heading}</span>
            </span>
            <button
              disabled={busy === s.id}
              onClick={async () => {
                setBusy(s.id);
                try {
                  await onRegenerate(s.id);
                } finally {
                  setBusy(null);
                }
              }}
              className="text-xs text-accent-400 hover:text-accent-300 disabled:opacity-50 shrink-0 inline-flex items-center gap-1"
              title="Régénérer cette section"
            >
              {busy === s.id ? (
                <Icon name="spinner" size={12} />
              ) : (
                <Icon name="refresh" size={12} />
              )}
              Régénérer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
