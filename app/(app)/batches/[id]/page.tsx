"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { runBatch } from "@/lib/pipeline";
import { Job } from "@/lib/types";
import { Icon } from "@/components/Icon";

const STEP_LABELS: Record<string, string> = {
  serp: "SERP",
  scrape: "Scrape",
  parse: "Parse",
  analyze: "Analyse",
  blueprint: "Blueprint",
  generate: "Génération",
  image: "Image",
  link: "Maillage",
  score: "Coverage",
};

const STATUS_TONE: Record<string, string> = {
  done: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  running: "border-accent-500/40 text-accent-200 bg-accent-500/10",
  queued: "border-zinc-700 text-zinc-400 bg-zinc-800/30",
  paused: "border-amber-600/50 text-amber-200 bg-amber-500/10",
  failed: "border-red-700/50 text-red-300 bg-red-500/10",
  capped: "border-orange-600/50 text-orange-200 bg-orange-500/10",
};

export default function BatchPage() {
  const params = useParams<{ id: string }>();
  const batchId = params.id;

  const { data: jobs, mutate } = useSWR<Job[]>(
    batchId ? `/srv/batches/${batchId}` : null,
    fetcher,
    { refreshInterval: 3000 }
  );

  const cancelled = useRef(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!jobs || running) return;
    const queued = jobs.filter((j) => j.status === "queued");
    if (queued.length === 0) return;
    setRunning(true);
    cancelled.current = false;
    runBatch(queued, {
      onJobUpdate: () => mutate(),
      cancelled: () => cancelled.current,
    })
      .catch(() => { /* errors surface via job rows */ })
      .finally(() => {
        setRunning(false);
        mutate();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs?.length]);

  if (!jobs) return <p className="text-zinc-500">Chargement…</p>;

  const total = jobs.length;
  const done = jobs.filter((j) => j.status === "done").length;
  const live = jobs.filter((j) => ["queued", "running", "paused"].includes(j.status)).length;
  const failed = jobs.filter((j) => ["failed", "capped"].includes(j.status)).length;
  const totalCost = jobs.reduce((acc, j) => acc + Number(j.cost_actual || 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6 animate-fadein">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">Lot en cours</div>
          <h1 className="h-page">
            Lot de {total} contenu{total > 1 ? "s" : ""}
          </h1>
          <p className="h-sub flex flex-wrap gap-x-3 gap-y-1">
            <span><span className="text-emerald-300 font-medium">{done}</span> terminé{done > 1 ? "s" : ""}</span>
            <span className="text-zinc-700">·</span>
            <span><span className="text-accent-300 font-medium">{live}</span> en cours</span>
            <span className="text-zinc-700">·</span>
            <span><span className="text-red-300 font-medium">{failed}</span> en échec</span>
            <span className="text-zinc-700">·</span>
            <span className="tabular-nums">${totalCost.toFixed(4)} dépensés</span>
          </p>
        </div>
        {running && (
          <button
            onClick={() => {
              cancelled.current = true;
              setRunning(false);
            }}
            className="btn-danger px-3 py-2 text-xs"
          >
            <Icon name="pause" size={12} />
            Arrêter le batch
          </button>
        )}
      </header>

      <div className="card p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
            <span className="label">Progression</span>
            <span className="tabular-nums text-zinc-300">{done} / {total} · {pct}%</span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-2 bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {running && (
        <div className="card border-accent-500/40 bg-accent-500/8 text-accent-100 p-3 text-sm flex items-start gap-2">
          <Icon name="info" size={14} className="mt-0.5 shrink-0 text-accent-300" />
          <span>
            Génération en cours… <strong className="text-white">garde cet onglet ouvert</strong> pendant la
            durée du batch (≈ 1 min par mot-clé). Tu peux naviguer dans l'app dans
            un autre onglet.
          </span>
        </div>
      )}

      <div className="card divide-y divide-[var(--border)] overflow-hidden">
        {jobs.map((j) => (
          <BatchRow key={j.id} job={j} />
        ))}
      </div>
    </div>
  );
}

function BatchRow({ job }: { job: Job }) {
  const tone = STATUS_TONE[job.status] || STATUS_TONE.queued;
  const stepLabel = job.current_step ? STEP_LABELS[job.current_step] || job.current_step : "—";
  const href = job.content_id ? `/contents/${job.content_id}` : `/jobs/${job.id}`;

  return (
    <Link
      href={href}
      className="group grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors"
    >
      <div className="min-w-0">
        <div className="font-medium truncate text-zinc-100">{job.keyword}</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {job.content_type} · {stepLabel}
        </div>
      </div>
      <span className={`chip ${tone}`}>{job.status}</span>
      <div className="text-xs text-zinc-500 tabular-nums">
        ${Number(job.cost_actual).toFixed(4)}
      </div>
      <Icon name="chevron-right" size={14} className="text-zinc-600 group-hover:text-accent-400 transition-colors" />
    </Link>
  );
}
