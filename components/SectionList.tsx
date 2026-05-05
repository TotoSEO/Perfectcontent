"use client";

import { useMemo, useState } from "react";

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
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 text-sm text-zinc-500">
        Aucune section H2 détectée.
      </div>
    );
  }

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm uppercase tracking-wider text-zinc-500">Sections H2</h3>
      <ul className="space-y-1 text-sm">
        {sections.map((s) => (
          <li key={s.id} className="flex justify-between items-center gap-2">
            <span className="truncate">{s.heading}</span>
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
              className="text-xs text-accent-500 hover:underline disabled:opacity-50 shrink-0"
            >
              {busy === s.id ? "…" : "Régénérer"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
