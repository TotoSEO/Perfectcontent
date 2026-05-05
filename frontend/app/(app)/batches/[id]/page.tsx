"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { runBatch, Step } from "@/lib/pipeline";
import { Job } from "@/lib/types";

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
  done: "bg-emerald-700/30 text-emerald-200 border-emerald-700",
  running: "bg-accent-500/20 text-accent-100 border-accent-500",
  queued: "bg-ink-800 text-zinc-400 border-ink-700",
  paused: "bg-amber-700/30 text-amber-100 border-amber-700",
  failed: "bg-red-800/30 text-red-200 border-red-700",
  capped: "bg-orange-800/30 text-orange-200 border-orange-700",
};

export default function BatchPage() {
  const params = useParams<{ id: string }>();
  const batchId = params.id;

  const { data: jobs, mutate } = useSWR<Job[]>(
    batchId ? `/api/batches/${batchId}` : null,
    fetcher,
    { refreshInterval: 3000 }
  );

  const cancelled = useRef(false);
  const [running, setRunning] = useState(false);

  // Auto-start orchestration once when the batch loads with queued jobs
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
      .catch(() => {
        /* errors surface via job rows */
      })
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

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Lot de {total} contenu{total > 1 ? "s" : ""}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {done} terminé{done > 1 ? "s" : ""} · {live} en cours · {failed} en échec ·
            coût total ${totalCost.toFixed(4)}
          </p>
        </div>
        {running && (
          <button
            onClick={() => {
              cancelled.current = true;
              setRunning(false);
            }}
            className="text-xs text-red-400 hover:underline"
          >
            Arrêter le batch
          </button>
        )}
      </div>

      {running && (
        <div className="bg-accent-500/10 border border-accent-500/40 text-accent-100 rounded-xl p-3 text-sm">
          Génération en cours… <strong>garde cet onglet ouvert</strong> pendant la
          durée du batch (≈ 1 min par mot-clé). Tu peux naviguer dans l'app dans
          un autre onglet.
        </div>
      )}

      <div className="bg-ink-900 border border-ink-800 rounded-xl divide-y divide-ink-800">
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
      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 hover:bg-ink-800/50"
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{job.keyword}</div>
        <div className="text-xs text-zinc-500">
          {job.content_type} · {stepLabel}
        </div>
      </div>
      <div className={`text-xs border rounded px-2 py-0.5 ${tone}`}>{job.status}</div>
      <div className="text-xs text-zinc-500 tabular-nums">
        ${Number(job.cost_actual).toFixed(4)}
      </div>
      <div className="text-xs text-accent-500">→</div>
    </Link>
  );
}
