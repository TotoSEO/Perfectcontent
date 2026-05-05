"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { runSiloToCompletion } from "@/lib/pipeline";

type Member = {
  content_id: string;
  role: "pillar" | "satellite" | string | null;
  keyword: string;
  slug: string | null;
  url: string;
  status: string;
  chosen_title: string | null;
  has_blueprint: boolean;
  has_html: boolean;
};

type MeshExpected = {
  target_url: string;
  kind: "pillar" | "peer" | "satellite";
  count: number;
  ok: boolean;
  first_position?: number | null;
  similarity?: number;
};
type MeshRow = {
  content_id: string;
  role: string | null;
  url: string;
  title: string | null;
  expected: MeshExpected[];
  issues: string[];
};

type Silo = {
  id: string;
  name: string | null;
  pillar_keyword: string | null;
  pillar_external_url: string | null;
  pillar_content_id: string | null;
  base_url: string;
  trailing_slash: boolean;
  batch_id: string | null;
  status: string;
  members: Member[];
  mesh_audit: { rows: MeshRow[]; summary: { members: number; issues: number; all_ok: boolean } } | null;
};

type JobMini = { id: string; content_id: string | null; status: string; current_step: string | null };

const STATUS_TONE: Record<string, string> = {
  done: "bg-emerald-700/30 text-emerald-200 border-emerald-700",
  running: "bg-accent-500/20 text-accent-100 border-accent-500",
  queued: "bg-ink-800 text-zinc-400 border-ink-700",
  paused: "bg-amber-700/30 text-amber-100 border-amber-700",
  failed: "bg-red-800/30 text-red-200 border-red-700",
  capped: "bg-orange-800/30 text-orange-200 border-orange-700",
  generated: "bg-blue-700/30 text-blue-200 border-blue-700",
  editing: "bg-emerald-700/30 text-emerald-200 border-emerald-700",
  analysis: "bg-ink-800 text-zinc-400 border-ink-700",
};

const PHASE_LABEL: Record<string, string> = {
  blueprint: "Blueprints en parallèle",
  manifest: "Construction du manifest",
  satellites: "Génération des satellites",
  pillar: "Génération du pilier",
  validate: "Validation du maillage",
  done: "Terminé",
};

export default function SiloPage() {
  const params = useParams<{ id: string }>();
  const siloId = params.id;

  const { data: silo, mutate } = useSWR<Silo>(
    siloId ? `/srv/silos/${siloId}` : null,
    fetcher,
    { refreshInterval: 4000 },
  );
  const { data: batchJobs, mutate: mutateJobs } = useSWR<JobMini[]>(
    silo?.batch_id ? `/srv/batches/${silo.batch_id}` : null,
    fetcher,
    { refreshInterval: 4000 },
  );

  const [phase, setPhase] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!silo || !batchJobs || running || startedRef.current) return;
    if (silo.status === "done" || silo.status === "partial") return;
    // Map content_id -> jobId
    const jobByContent = new Map<string, string>();
    for (const j of batchJobs) if (j.content_id) jobByContent.set(j.content_id, j.id);
    const ordered = silo.members
      .map((m) => ({ jobId: jobByContent.get(m.content_id) || "", role: m.role }))
      .filter((m) => m.jobId);
    if (ordered.length !== silo.members.length) return;
    startedRef.current = true;
    setRunning(true);
    cancelled.current = false;
    runSiloToCompletion(silo.id, ordered, {
      onJob: () => { mutate(); mutateJobs(); },
      onPhase: (p) => setPhase(p),
      cancelled: () => cancelled.current,
    })
      .catch((e) => console.error(e))
      .finally(() => {
        setRunning(false);
        mutate();
        mutateJobs();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silo, batchJobs]);

  if (!silo) return <p className="text-zinc-500">Chargement…</p>;

  const pillar = silo.members.find((m) => m.role === "pillar");
  const sats = silo.members.filter((m) => m.role === "satellite");
  const externalPillar = !pillar && silo.pillar_external_url;

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <span className="text-accent-400">◧</span>
          {silo.name || "Silo"}
        </h1>
        <p className="text-sm text-zinc-500">
          {sats.length} satellite{sats.length > 1 ? "s" : ""} •{" "}
          {externalPillar ? (
            <>pilier externe <code>{silo.pillar_external_url}</code></>
          ) : (
            <>pilier interne <code>{pillar?.url}</code></>
          )}
        </p>
      </header>

      {/* Phase indicator */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex items-center justify-between">
        <div className="text-sm">
          <span className="text-zinc-500 mr-2">État :</span>
          <span className={`text-sm border rounded px-2 py-0.5 ${STATUS_TONE[silo.status] || STATUS_TONE.queued}`}>
            {silo.status}
          </span>
          {phase && (
            <span className="ml-3 text-xs text-zinc-400">
              ▸ {PHASE_LABEL[phase] || phase}
            </span>
          )}
        </div>
        {running && (
          <button
            onClick={() => { cancelled.current = true; }}
            className="text-xs text-zinc-500 hover:text-red-300"
          >
            Annuler
          </button>
        )}
      </div>

      {/* Member list */}
      <section className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
          Membres du silo
        </div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-ink-900/60">
            <tr>
              <th className="text-left px-4 py-2">Rôle</th>
              <th className="text-left px-3 py-2">Mot-clé</th>
              <th className="text-left px-3 py-2">URL</th>
              <th className="text-left px-3 py-2 w-32">Status</th>
              <th className="text-left px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {silo.members.map((m) => (
              <tr key={m.content_id} className="border-t border-ink-800">
                <td className="px-4 py-2">
                  {m.role === "pillar" ? (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-accent-500/20 text-accent-200 border border-accent-500/40">
                      ◉ pilier
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/15 text-blue-200 border border-blue-500/30">
                      ○ satellite
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-200">{m.keyword}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-500 truncate max-w-[300px]">
                  {m.url}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] border rounded px-2 py-0.5 ${STATUS_TONE[m.status] || STATUS_TONE.queued}`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {m.has_html && (
                    <Link
                      href={`/contents/${m.content_id}`}
                      className="text-xs text-accent-400 hover:text-accent-300"
                    >
                      Ouvrir →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Mesh audit */}
      {silo.mesh_audit && (
        <section className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-800 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500">
              Mesh status
            </h2>
            <span className={`text-xs ${silo.mesh_audit.summary.all_ok ? "text-emerald-300" : "text-amber-300"}`}>
              {silo.mesh_audit.summary.all_ok
                ? "✓ tous les liens en place"
                : `${silo.mesh_audit.summary.issues} problème(s) à corriger manuellement`}
            </span>
          </div>
          <div className="divide-y divide-ink-800">
            {silo.mesh_audit.rows.map((row) => (
              <details key={row.content_id} className="px-5 py-3" open={row.issues.length > 0}>
                <summary className="cursor-pointer flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {row.role}
                    </span>
                    <span className="text-zinc-200">{row.title || row.url}</span>
                  </span>
                  <span className={`text-xs ${row.issues.length === 0 ? "text-emerald-300" : "text-amber-300"}`}>
                    {row.issues.length === 0 ? "✓ OK" : `${row.issues.length} pb`}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {row.expected.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 font-mono">
                      <span className={`w-2 h-2 rounded-full ${e.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <span className="text-zinc-500 w-16 uppercase tracking-wider">{e.kind}</span>
                      <span className="text-zinc-300 flex-1 truncate">{e.target_url}</span>
                      <span className={`tabular-nums ${e.ok ? "text-emerald-300" : "text-amber-300"}`}>
                        ×{e.count}{e.kind === "pillar" && e.first_position != null ? ` (¶${e.first_position + 1})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
