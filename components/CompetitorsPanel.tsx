"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";

type Competitor = {
  url: string;
  title: string | null;
  word_count: number;
  paragraphs_count?: number;
  h3_count?: number;
  lists_count?: number;
  tables_count?: number;
  images_with_alt?: number;
  images_without_alt?: number;
  has_faq_schema?: boolean;
  quality?: number;
};

type Current = {
  title: string | null;
  word_count: number;
  paragraphs_count: number;
  h2_count: number;
  h3_count: number;
  lists_count: number;
  tables_count: number;
  coverage_score: number | null;
  internal_links_count: number;
};

type Resp = { competitors: Competitor[]; current: Current };

function shortUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.hostname.replace(/^www\./, "") + parsed.pathname.replace(/\/$/, "");
  } catch {
    return u;
  }
}

export function CompetitorsPanel({ contentId }: { contentId: string }) {
  const { data } = useSWR<Resp>(`/srv/contents/${contentId}/competitors`, fetcher);

  if (!data) {
    return (
      <div className="card p-4 text-sm text-zinc-500">
        Chargement de la comparaison…
      </div>
    );
  }
  if (!data.competitors.length) {
    return (
      <div className="card p-4 text-sm text-zinc-500">
        Aucun concurrent indexé. La comparaison apparaîtra dès qu'une analyse
        SERP aura tourné.
      </div>
    );
  }

  const c = data.current;
  const competitorAvg = (key: keyof Competitor): number => {
    const vals = data.competitors
      .map((cp) => Number(cp[key] ?? 0))
      .filter((n) => !isNaN(n));
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const avgWords = Math.round(competitorAvg("word_count"));
  const avgParas = Math.round(competitorAvg("paragraphs_count"));
  const avgH3 = competitorAvg("h3_count").toFixed(1);
  const avgLists = competitorAvg("lists_count").toFixed(1);
  const avgTables = competitorAvg("tables_count").toFixed(1);
  const avgImg = (
    competitorAvg("images_with_alt") + competitorAvg("images_without_alt")
  ).toFixed(1);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#25252a] flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
          Comparaison vs concurrents
        </h3>
        <span className="text-[11px] text-zinc-500">
          {data.competitors.length} concurrents analysés
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-[#1a1a1e]">
            <tr>
              <th className="text-left px-4 py-2.5">Site</th>
              <th className="text-right px-2 py-2.5">Mots</th>
              <th className="text-right px-2 py-2.5">¶</th>
              <th className="text-right px-2 py-2.5">H3</th>
              <th className="text-right px-2 py-2.5">Listes</th>
              <th className="text-right px-2 py-2.5">Tables</th>
              <th className="text-right px-2 py-2.5">Images</th>
              <th className="text-right px-2 py-2.5">FAQ</th>
              <th className="text-right px-3 py-2.5">Qualité</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.competitors.map((cp, i) => {
              const totalImg =
                Number(cp.images_with_alt || 0) + Number(cp.images_without_alt || 0);
              return (
                <tr
                  key={i}
                  className="border-t border-[#1f1f24] hover:bg-[#1a1a1e]"
                >
                  <td className="px-4 py-2 truncate max-w-[280px]">
                    <a
                      href={cp.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-300 hover:text-accent-400"
                      title={cp.title || cp.url}
                    >
                      {shortUrl(cp.url)}
                    </a>
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">{cp.word_count}</td>
                  <td className="text-right px-2 py-2 tabular-nums">
                    {cp.paragraphs_count ?? "—"}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">
                    {cp.h3_count ?? "—"}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">
                    {cp.lists_count ?? "—"}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">
                    {cp.tables_count ?? "—"}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">{totalImg || "—"}</td>
                  <td className="text-right px-2 py-2">
                    {cp.has_faq_schema ? "✓" : "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums text-zinc-400">
                    {cp.quality != null ? cp.quality.toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
            {/* Average row */}
            <tr className="border-t border-[#25252a] bg-[#15151a] text-zinc-400">
              <td className="px-4 py-2 italic">Moyenne concurrents</td>
              <td className="text-right px-2 py-2 tabular-nums">{avgWords}</td>
              <td className="text-right px-2 py-2 tabular-nums">{avgParas}</td>
              <td className="text-right px-2 py-2 tabular-nums">{avgH3}</td>
              <td className="text-right px-2 py-2 tabular-nums">{avgLists}</td>
              <td className="text-right px-2 py-2 tabular-nums">{avgTables}</td>
              <td className="text-right px-2 py-2 tabular-nums">{avgImg}</td>
              <td className="text-right px-2 py-2">—</td>
              <td className="text-right px-3 py-2">—</td>
            </tr>
            {/* Current row */}
            <tr className="border-t-2 border-accent-600/40 bg-accent-500/8 font-sans">
              <td className="px-4 py-2.5 font-semibold text-accent-300">
                Ton contenu actuel
              </td>
              <td className={cellClass(c.word_count, avgWords)}>{c.word_count}</td>
              <td className={cellClass(c.paragraphs_count, avgParas)}>
                {c.paragraphs_count}
              </td>
              <td className={cellClass(c.h3_count, Number(avgH3))}>{c.h3_count}</td>
              <td className={cellClass(c.lists_count, Number(avgLists))}>
                {c.lists_count}
              </td>
              <td className={cellClass(c.tables_count, Number(avgTables))}>
                {c.tables_count}
              </td>
              <td className="text-right px-2 py-2.5 text-zinc-500">—</td>
              <td className="text-right px-2 py-2.5 text-zinc-500">—</td>
              <td className="text-right px-3 py-2.5 tabular-nums">
                {c.coverage_score != null ? `${Math.round(c.coverage_score)}%` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellClass(actual: number, target: number): string {
  const base = "text-right px-2 py-2.5 tabular-nums";
  if (target === 0) return `${base} text-zinc-300`;
  const ratio = actual / target;
  if (ratio >= 0.9 && ratio <= 1.2) return `${base} text-emerald-300`;
  if (ratio < 0.7) return `${base} text-red-300`;
  if (ratio > 1.5) return `${base} text-amber-300`;
  return `${base} text-zinc-300`;
}
