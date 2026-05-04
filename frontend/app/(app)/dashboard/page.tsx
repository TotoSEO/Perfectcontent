"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Content } from "@/lib/types";

export default function DashboardPage() {
  const { data: contents } = useSWR<Content[]>("/api/contents", fetcher);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contenus</h1>
        <Link href="/new" className="bg-accent-600 hover:bg-accent-500 px-3 py-2 rounded text-sm">
          + Nouveau
        </Link>
      </div>

      {!contents && <p className="text-zinc-500">Chargement…</p>}
      {contents && contents.length === 0 && (
        <p className="text-zinc-500">Aucun contenu pour l'instant.</p>
      )}
      <ul className="divide-y divide-ink-800 border border-ink-800 rounded-lg">
        {contents?.map((c) => (
          <li key={c.id} className="p-4 hover:bg-ink-900/50">
            <Link href={`/contents/${c.id}`} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.chosen_title || c.keyword}</div>
                <div className="text-xs text-zinc-500">
                  {c.content_type} · {c.status} · {c.intent || "—"}
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                {c.coverage_score != null ? `couverture ${c.coverage_score}%` : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
