"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
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

  if (!jobs) return <p className="text-zinc-500">Chargement…</p>;

  const total = jobs.length;
  const done = jobs.filter((j) => j.status === "done").length;
  const running = jobs.filter((j) => ["queued", "running", "paused"].includes(j.status)).length;
  const failed = jobs.filter((j) => ["failed", "capped"].includes(j.status)).length;
  const totalCost = jobs.reduce((acc, j) => acc + Number(j.cost_actual || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Lot de {total} contenu{total > 1 ? "s" : ""}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {done} terminé{done > 1 ? "s" : ""} · {running} en cours · {failed} en échec · coût total{" "}
          ${totalCost.toFixed(4)}
        </p>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-xl divide-y divide-ink-800">
        {jobs.map((j) => (
          <BatchRow key={j.id} job={j} />
        ))}
      </div>

      <button
        onClick={() => mutate()}
        className="text-xs text-accent-500 hover:underline"
      >
        Rafraîchir
      </button>
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
