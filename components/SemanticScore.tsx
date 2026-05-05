"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { countTerms, htmlToPlain } from "@/lib/stopwords";

export type TermTarget = {
  term: string;
  target: number;
  min: number;
  max: number;
  importance: number;
};

type Status = "missing" | "low" | "ok" | "over";

function statusFor(count: number, t: TermTarget): Status {
  if (count === 0) return "missing";
  if (count < t.min) return "low";
  if (count > t.max) return "over";
  return "ok";
}

const TONE: Record<Status, { bar: string; chip: string }> = {
  missing: { bar: "bg-red-500/40", chip: "text-red-300" },
  low: { bar: "bg-amber-500/50", chip: "text-amber-300" },
  ok: { bar: "bg-emerald-500/60", chip: "text-emerald-300" },
  over: { bar: "bg-orange-500/50", chip: "text-orange-300" },
};

export function SemanticScore({
  contentId,
  html,
}: {
  contentId: string;
  html: string;
}) {
  const { data } = useSWR<{ keyword: string; targets: TermTarget[] }>(
    `/api/contents/${contentId}/semantic-targets`,
    fetcher,
  );

  const targets = data?.targets ?? [];

  // Debounce the html → plain → counts pipeline so big edits don't lag the UI.
  const [debouncedHtml, setDebouncedHtml] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedHtml(html), 300);
    return () => clearTimeout(t);
  }, [html]);

  const counts = useMemo(
    () => countTerms(htmlToPlain(debouncedHtml || "")),
    [debouncedHtml],
  );

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
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 text-sm text-zinc-500">
        Chargement du score sémantique…
      </div>
    );
  }
  if (targets.length === 0) {
    return (
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 text-sm text-zinc-500">
        Aucune cible sémantique calculée. Le rapport SERP n'est peut-être pas terminé.
      </div>
    );
  }

  const tone =
    summary.score >= 75
      ? "text-emerald-300 border-emerald-700 bg-emerald-700/20"
      : summary.score >= 50
      ? "text-amber-200 border-amber-700 bg-amber-700/20"
      : "text-red-300 border-red-700 bg-red-700/20";

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-wider text-zinc-500">
          Score sémantique
        </h3>
        <div className={`text-sm border rounded px-2 py-0.5 tabular-nums ${tone}`}>
          {summary.score}%
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider">
        <Pill label="Présents" value={summary.breakdown.ok} tone="ok" />
        <Pill label="Manquants" value={summary.breakdown.missing} tone="missing" />
        <Pill label="Sous-utilisés" value={summary.breakdown.low} tone="low" />
        <Pill label="Sur-utilisés" value={summary.breakdown.over} tone="over" />
      </div>

      <ul className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
        {targets.map((t) => {
          const count = counts.get(t.term) ?? 0;
          const st = statusFor(count, t);
          const fill = Math.max(2, Math.min(100, t.importance * 100));
          return (
            <li
              key={t.term}
              className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs"
            >
              <div className="min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="truncate font-medium">{t.term}</span>
                  <span className={`tabular-nums ${TONE[st].chip}`}>
                    {count}/{t.target}
                  </span>
                </div>
                <div className="h-1.5 mt-1 bg-ink-800 rounded overflow-hidden">
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
    <div className={`border border-ink-800 rounded px-2 py-1 text-center ${TONE[tone].chip}`}>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
