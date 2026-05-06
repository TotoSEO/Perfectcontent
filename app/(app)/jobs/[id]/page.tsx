"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Blueprint, Content, Job } from "@/lib/types";
import { JobTimeline } from "@/components/JobTimeline";
import { BlueprintEditor } from "@/components/BlueprintEditor";
import { runJobToCompletion } from "@/lib/pipeline";
import { Icon } from "@/components/Icon";

const STATUS_TONE: Record<string, string> = {
  done: "border-emerald-700/50 text-emerald-300 bg-emerald-500/10",
  running: "border-accent-500/40 text-accent-200 bg-accent-500/10",
  queued: "border-zinc-700 text-zinc-400 bg-zinc-800/30",
  paused: "border-amber-600/50 text-amber-200 bg-amber-500/10",
  failed: "border-red-700/50 text-red-300 bg-red-500/10",
  capped: "border-orange-600/50 text-orange-200 bg-orange-500/10",
};

export default function JobPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: job, mutate } = useSWR<Job>(id ? `/srv/jobs/${id}` : null, fetcher, {
    refreshInterval: 2000,
  });
  const { data: content } = useSWR<Content>(
    job?.content_id ? `/srv/contents/${job.content_id}` : null,
    fetcher,
    { refreshInterval: 2500 }
  );

  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!job || running || busy) return;
    if (job.status !== "queued") return;
    setRunning(true);
    cancelled.current = false;
    runJobToCompletion(job.id, {
      onStep: () => mutate(),
      cancelled: () => cancelled.current,
    })
      .finally(() => {
        setRunning(false);
        mutate();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  useEffect(() => {
    if (job?.status === "done" && job.content_id) {
      router.push(`/contents/${job.content_id}`);
    }
  }, [job, router]);

  async function submitBlueprint(bp: Blueprint) {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/srv/jobs/${id}/blueprint`, { method: "POST", json: { blueprint: bp } });
      runJobToCompletion(id, { fromStep: "generate", onStep: () => mutate() })
        .finally(() => mutate());
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!id) return;
    cancelled.current = true;
    await api(`/srv/jobs/${id}/cancel`, { method: "POST" });
    mutate();
  }

  async function retry() {
    if (!id) return;
    await api(`/srv/jobs/${id}/retry`, { method: "POST" });
    mutate();
  }

  if (!job) return <p className="text-zinc-500">Chargement…</p>;

  const tone = STATUS_TONE[job.status] || STATUS_TONE.queued;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadein">
      <div className="lg:col-span-1 space-y-4">
        <div className="card p-5 space-y-3">
          <div className="space-y-1">
            <div className="eyebrow">Job</div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50 break-words">
              {job.keyword}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${tone}`}>{job.status}</span>
            <span className="chip-soft">{job.content_type}</span>
            <span className="chip-soft tabular-nums">
              ${Number(job.cost_actual).toFixed(4)}
              <span className="text-zinc-500"> / ${job.cost_cap ? Number(job.cost_cap).toFixed(2) : "∞"}</span>
            </span>
          </div>
        </div>

        <div className="card p-4">
          <div className="label mb-3">Étapes</div>
          <JobTimeline job={job} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {(job.status === "running" || job.status === "queued") && (
            <button onClick={cancel} className="btn-danger px-3 py-2 text-xs">
              <Icon name="x" size={12} />
              Annuler le job
            </button>
          )}
          {(job.status === "failed" || job.status === "capped") && (
            <button onClick={retry} className="btn-secondary px-3 py-2 text-xs">
              <Icon name="refresh" size={12} />
              Relancer (cache préservé)
            </button>
          )}
        </div>

        {job.error && (
          <div className="card border-red-700/50 bg-red-500/10 text-red-100 p-4 text-sm space-y-1">
            <div className="font-semibold inline-flex items-center gap-1.5">
              <Icon name="alert" size={14} />
              Erreur — étape « {job.current_step || "inconnue"} »
            </div>
            <div className="text-xs opacity-90 break-words">{job.error}</div>
          </div>
        )}
        {running && (
          <div className="text-xs text-zinc-500 inline-flex items-center gap-1.5">
            <Icon name="info" size={12} />
            Garde cet onglet ouvert pendant la génération.
          </div>
        )}
      </div>

      <div className="lg:col-span-2 space-y-4">
        {job.status === "paused" && content?.blueprint ? (
          <div className="card p-6">
            <div className="mb-4">
              <div className="eyebrow">À valider</div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50 mt-1">Blueprint éditorial</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Ajuste le plan H2/H3, l'angle et les mots cibles puis valide pour lancer la génération.
              </p>
            </div>
            <BlueprintEditor
              initial={content.blueprint}
              onSubmit={submitBlueprint}
              busy={busy}
            />
          </div>
        ) : (
          <AuditView job={job} />
        )}
      </div>
    </div>
  );
}

function AuditView({ job }: { job: Job }) {
  const steps = job.audit?.steps || [];
  return (
    <div className="card overflow-hidden">
      <div className="card-section">
        <h2 className="label">Audit des étapes</h2>
        <span className="text-[11px] text-zinc-500 tabular-nums">{steps.length}</span>
      </div>
      <ul className="divide-y divide-[var(--border)] font-mono text-xs max-h-[60vh] overflow-y-auto">
        {steps.length === 0 && (
          <li className="px-5 py-8 text-center text-zinc-500 text-sm">
            En attente du démarrage…
          </li>
        )}
        {steps.map((s, i) => (
          <li key={i} className="px-5 py-2.5 flex items-baseline gap-3">
            <span className="text-zinc-600 tabular-nums w-20 shrink-0">
              {new Date(s.ts * 1000).toLocaleTimeString()}
            </span>
            <span className="text-accent-400 w-24 shrink-0">{s.step}</span>
            <span className={`text-[11px] uppercase tracking-wider ${
              s.status === "done" ? "text-emerald-300"
              : s.status === "failed" ? "text-red-300"
              : "text-zinc-400"
            }`}>
              {s.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
