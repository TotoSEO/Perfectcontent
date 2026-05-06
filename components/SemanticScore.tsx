"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { countSurfaces, htmlToPlain } from "@/lib/stopwords";

export type TermTarget = {
  term: string;
  target: number;
  min: number;
  max: number;
  importance: number;
  is_ngram?: boolean;
  surface_forms?: string[];
};

type Status = "missing" | "low" | "ok" | "over";

function statusFor(count: number, t: TermTarget): Status {
  if (count === 0) return "missing";
  if (count < t.min) return "low";
  if (count > t.max) return "over";
  return "ok";
}

const TONE: Record<Status, { bar: string; chip: string; pill: string }> = {
  missing: { bar: "bg-red-500/40", chip: "text-red-300", pill: "border-red-700/50 text-red-300 bg-red-500/10" },
  low: { bar: "bg-amber-500/55", chip: "text-amber-300", pill: "border-amber-600/50 text-amber-200 bg-amber-500/10" },
  ok: { bar: "bg-emerald-500/65", chip: "text-emerald-300", pill: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10" },
  over: { bar: "bg-orange-500/55", chip: "text-orange-300", pill: "border-orange-600/50 text-orange-200 bg-orange-500/10" },
};

export function SemanticScore({
  contentId,
  html,
}: {
  contentId: string;
  html: string;
}) {
  const { data } = useSWR<{ keyword: string; targets: TermTarget[] }>(
    `/srv/contents/${contentId}/semantic-targets`,
    fetcher,
  );

  const targets = data?.targets ?? [];

  const [debouncedHtml, setDebouncedHtml] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedHtml(html), 300);
    return () => clearTimeout(t);
  }, [html]);

  const plain = useMemo(
    () => htmlToPlain(debouncedHtml || ""),
    [debouncedHtml],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of targets) {
      const surfaces = t.surface_forms?.length ? t.surface_forms : [t.term];
      m.set(t.term, countSurfaces(plain, surfaces));
    }
    return m;
  }, [targets, plain]);

  const summary = useMemo(() => {
    const breakdown: Record<Status, number> = { missing: 0, low: 0, ok: 0, over: 0 };
    for (const t of targets) {
      breakdown[statusFor(counts.get(t.term) ?? 0, t)]++;
    }
    const total = targets.length || 1;
    const score = Math.round(((breakdown.ok + breakdown.over * 0.7) / total) * 100);
    return { breakdown, score };
  }, [targets, counts]);

  if (!data) {
    return (
      <div className="card p-4 text-sm text-zinc-500">Chargement du score sémantique…</div>
    );
  }
  if (targets.length === 0) {
    return (
      <div className="card p-4 text-sm text-zinc-500">
        Aucune cible sémantique. Le rapport SERP n'est peut-être pas terminé.
      </div>
    );
  }

  const tone =
    summary.score >= 75
      ? "border-emerald-700/50 text-emerald-300 bg-emerald-500/10"
      : summary.score >= 50
      ? "border-amber-600/50 text-amber-200 bg-amber-500/10"
      : "border-red-700/50 text-red-300 bg-red-500/10";

  return (
    <div className="card overflow-hidden">
      <div className="card-section">
        <h3 className="label">Score sémantique</h3>
        <div className={`text-sm rounded-full px-2.5 py-1 tabular-nums border font-semibold ${tone}`}>
          {summary.score}%
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider">
          <Pill label="Présents" value={summary.breakdown.ok} tone="ok" />
          <Pill label="Manquants" value={summary.breakdown.missing} tone="missing" />
          <Pill label="Sous-util." value={summary.breakdown.low} tone="low" />
          <Pill label="Sur-util." value={summary.breakdown.over} tone="over" />
        </div>

        <ul className="space-y-1 max-h-[480px] overflow-y-auto pr-1 -mr-1">
          {targets.map((t) => {
            const count = counts.get(t.term) ?? 0;
            const st = statusFor(count, t);
            const fill = Math.max(2, Math.min(100, t.importance * 100));
            return (
              <li
                key={t.term}
                className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs py-1"
              >
                <div className="min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="truncate font-medium text-zinc-200">
                      {t.is_ngram && (
                        <span className="text-[9px] uppercase tracking-wider text-accent-400/80 mr-1">
                          ◆
                        </span>
                      )}
                      {t.term}
                    </span>
                    <span className={`tabular-nums font-medium ${TONE[st].chip}`}>
                      {count}/{t.target}
                    </span>
                  </div>
                  <div className="h-1.5 mt-1 bg-white/[0.04] rounded overflow-hidden">
                    <div
                      className={`h-full ${TONE[st].bar} transition-all`}
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Status;
}) {
  return (
    <div className={`border rounded-lg px-2 py-1.5 text-center ${TONE[tone].pill}`}>
      <div className="text-[9px] tracking-wider opacity-80">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
