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
  done: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  editing: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  generated: "border-blue-700/50 text-blue-300 bg-blue-500/10",
  running: "border-accent-500/50 text-accent-200 bg-accent-500/10",
  paused: "border-amber-700/50 text-amber-200 bg-amber-500/10",
  failed: "border-red-700/50 text-red-300 bg-red-500/10",
  capped: "border-orange-700/50 text-orange-300 bg-orange-500/10",
  queued: "border-[#34343b] text-zinc-400 bg-[#1c1c20]",
  analysis: "border-[#34343b] text-zinc-400 bg-[#1c1c20]",
  planning: "border-[#34343b] text-zinc-400 bg-[#1c1c20]",
  blueprinting: "border-accent-500/50 text-accent-200 bg-accent-500/10",
  generating: "border-accent-500/50 text-accent-200 bg-accent-500/10",
  partial: "border-amber-700/50 text-amber-200 bg-amber-500/10",
};

const PHASES: { id: string; label: string }[] = [
  { id: "blueprint", label: "Blueprints" },
  { id: "manifest", label: "Manifest" },
  { id: "satellites", label: "Satellites" },
  { id: "pillar", label: "Pilier" },
  { id: "validate", label: "Validation" },
];

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

  const done = silo.members.filter((m) => m.status === "editing" || m.status === "generated").length;
  const total = silo.members.length;

  return (
    <div className="space-y-6 max-w-6xl animate-fadein">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label mb-1.5">Silo SEO</div>
          <h1 className="text-[28px] font-semibold tracking-tight flex items-center gap-2 truncate">
            <span className="text-accent-400">◧</span>
            <span className="truncate">{silo.name || "Silo"}</span>
          </h1>
          <p className="text-sm text-zinc-500 mt-1 truncate max-w-3xl">
            {sats.length} satellite{sats.length > 1 ? "s" : ""} ·{" "}
            {externalPillar ? (
              <>pilier externe <code className="text-accent-300">{silo.pillar_external_url}</code></>
            ) : (
              <>pilier interne <code className="text-accent-300">{pillar?.url}</code></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${STATUS_TONE[silo.status] || STATUS_TONE.queued}`}>
            {silo.status}
          </span>
          {running && (
            <button
              onClick={() => { cancelled.current = true; }}
              className="btn-ghost text-xs"
            >
              Annuler
            </button>
          )}
        </div>
      </header>

      {/* Phase bar */}
      <PhaseBar current={phase} status={silo.status} />

      {/* Progress strip */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div className="text-sm">
          <div className="font-medium tabular-nums">{done} / {total} contenus prêts</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {silo.status === "done" ? "Tout est généré et le maillage est validé." :
             silo.status === "partial" ? "Le maillage présente des problèmes — vois en bas." :
             "Le pipeline tourne — chaque article passe SERP → blueprint → génération → validation."}
          </div>
        </div>
        <div className="w-40 h-2 bg-[#1c1c20] rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-500 transition-all"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Members list */}
      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[#25252a] flex items-baseline justify-between">
          <h2 className="label">Membres du silo</h2>
          <span className="text-xs text-zinc-500">
            {pillar ? "1 pilier + " : ""}{sats.length} satellite{sats.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="divide-y divide-[#1f1f24]">
          {silo.members.map((m) => (
            <li key={m.content_id}>
              <Link
                href={m.has_html ? `/contents/${m.content_id}` : "#"}
                className={`flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors ${
                  m.has_html ? "hover:bg-[#1a1a1e]" : "cursor-default"
                }`}
              >
                <span className={`chip ${
                  m.role === "pillar"
                    ? "border-accent-500/40 bg-accent-500/10 text-accent-200"
                    : "border-blue-500/30 bg-blue-500/5 text-blue-300"
                }`}>
                  {m.role === "pillar" ? "◉ pilier" : "○ satellite"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px] truncate">
                    {m.chosen_title || m.keyword}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate font-mono mt-0.5">
                    {m.url}
                  </div>
                </div>
                <span className={`chip ${STATUS_TONE[m.status] || STATUS_TONE.queued}`}>
                  {m.status}
                </span>
                {m.has_html && <span className="text-zinc-500 text-xs">→</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Mesh audit */}
      {silo.mesh_audit && <MeshAuditPanel audit={silo.mesh_audit} />}
    </div>
  );
}

function PhaseBar({ current, status }: { current: string | null; status: string }) {
  const completedFromStatus =
    status === "done" || status === "partial" ? PHASES.length : 0;
  const currentIdx = current ? PHASES.findIndex((p) => p.id === current) : -1;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {PHASES.map((p, i) => {
          const isCurrent = i === currentIdx;
          const isDone =
            (currentIdx > -1 && i < currentIdx) || completedFromStatus > i;
          return (
            <div key={p.id} className="flex items-center gap-2 min-w-fit">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors ${
                  isDone
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : isCurrent
                    ? "bg-accent-500/25 text-accent-200 border border-accent-500/50 animate-pulse"
                    : "bg-[#1c1c20] text-zinc-500 border border-[#34343b]"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  isDone ? "text-emerald-300" : isCurrent ? "text-accent-200" : "text-zinc-500"
                }`}
              >
                {p.label}
              </span>
              {i < PHASES.length - 1 && (
                <div
                  className={`w-8 h-px transition-colors ${
                    isDone ? "bg-emerald-500/40" : "bg-[#34343b]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeshAuditPanel({
  audit,
}: {
  audit: { rows: MeshRow[]; summary: { members: number; issues: number; all_ok: boolean } };
}) {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-[#25252a] flex items-baseline justify-between">
        <h2 className="label">Mesh status</h2>
        <span
          className={`chip ${
            audit.summary.all_ok
              ? "border-emerald-700/50 bg-emerald-500/10 text-emerald-300"
              : "border-amber-700/50 bg-amber-500/10 text-amber-200"
          }`}
        >
          {audit.summary.all_ok
            ? "✓ tous les liens OK"
            : `${audit.summary.issues} problème${audit.summary.issues > 1 ? "s" : ""} à corriger`}
        </span>
      </div>
      <ul className="divide-y divide-[#1f1f24]">
        {audit.rows.map((row) => (
          <li key={row.content_id} className="px-5 py-4">
            <details open={row.issues.length > 0}>
              <summary className="cursor-pointer flex items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`chip ${
                    row.role === "pillar"
                      ? "border-accent-500/40 bg-accent-500/10 text-accent-200"
                      : "border-blue-500/30 bg-blue-500/5 text-blue-300"
                  }`}>
                    {row.role}
                  </span>
                  <span className="font-medium truncate text-[13px]">
                    {row.title || row.url}
                  </span>
                </div>
                <span className={`text-xs whitespace-nowrap ${
                  row.issues.length === 0 ? "text-emerald-300" : "text-amber-300"
                }`}>
                  {row.issues.length === 0
                    ? `✓ ${row.expected.length} lien${row.expected.length > 1 ? "s" : ""}`
                    : `⚠ ${row.issues.length} pb`}
                </span>
              </summary>
              <ul className="mt-3 grid gap-1.5">
                {row.expected.map((e, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[12px]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        e.ok ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-16 shrink-0">
                      {e.kind}
                    </span>
                    <span className="text-zinc-400 flex-1 truncate font-mono text-[11px]">
                      {e.target_url}
                    </span>
                    <span className={`tabular-nums text-[11px] ${
                      e.ok ? "text-emerald-300" : "text-amber-300"
                    }`}>
                      ×{e.count}
                      {e.kind === "pillar" && e.first_position != null && (
                        <span className="text-zinc-500"> · ¶{e.first_position + 1}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
