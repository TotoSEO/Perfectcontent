"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

type AuditListItem = {
  id: string;
  name: string;
  url_count: number;
  score: number | null;
  created_at: string;
};

export default function AuditsListPage() {
  const { data: audits } = useSWR<AuditListItem[]>("/srv/audits", fetcher);
  return (
    <div className="space-y-6 max-w-5xl animate-fadein">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-1.5">Audit technique</div>
          <h1 className="text-[28px] font-semibold tracking-tight">Audits</h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Importe un crawl Screaming Frog et obtiens un rapport visuel slide
            par slide, prêt à coller dans tes Google Slides client.
          </p>
        </div>
        <Link href="/audits/new" className="btn-primary">+ Nouvel audit</Link>
      </header>

      {!audits && <p className="text-zinc-500 text-sm">Chargement…</p>}
      {audits && audits.length === 0 && (
        <div className="card p-14 text-center space-y-4 border-dashed">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-accent-600/15 border border-accent-500/30 flex items-center justify-center">
            <span className="text-accent-400 text-xl">⌗</span>
          </div>
          <div className="text-zinc-200 font-medium">Aucun audit pour l'instant</div>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Importe un fichier <code className="bg-[#1c1c20] px-1.5 py-0.5 rounded text-xs">internal_all.csv</code>{" "}
            depuis Screaming Frog pour générer ton premier rapport.
          </p>
          <Link href="/audits/new" className="btn-primary inline-flex">
            Importer un crawl
          </Link>
        </div>
      )}
      {audits && audits.length > 0 && (
        <ul className="card divide-y divide-[#1f1f24] overflow-hidden">
          {audits.map((a) => (
            <li key={a.id}>
              <Link
                href={`/audits/${a.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-[#1a1a1e] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-[14px]">{a.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                    {a.url_count.toLocaleString("fr-FR")} URLs ·{" "}
                    {new Date(a.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
                {a.score != null && (
                  <span
                    className={`chip tabular-nums ${
                      a.score >= 80
                        ? "border-emerald-700/50 text-emerald-300 bg-emerald-500/10"
                        : a.score >= 50
                        ? "border-amber-700/50 text-amber-300 bg-amber-500/10"
                        : "border-red-700/50 text-red-300 bg-red-500/10"
                    }`}
                  >
                    {Math.round(Number(a.score))}/100
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
