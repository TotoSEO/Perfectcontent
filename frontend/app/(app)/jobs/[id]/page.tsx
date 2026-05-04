"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Blueprint, Content, Job } from "@/lib/types";
import { JobTimeline } from "@/components/JobTimeline";
import { BlueprintEditor } from "@/components/BlueprintEditor";
import { subscribeSSE } from "@/lib/sse";

export default function JobPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: job, mutate } = useSWR<Job>(id ? `/api/jobs/${id}` : null, fetcher, {
    refreshInterval: 3000,
  });
  const { data: content } = useSWR<Content>(
    job?.content_id ? `/api/contents/${job.content_id}` : null,
    fetcher,
    { refreshInterval: 3000 }
  );

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeSSE(`/api/jobs/${id}/events`, () => {
      mutate();
    });
    return unsub;
  }, [id, mutate]);

  useEffect(() => {
    if (job?.status === "done" && job.content_id) {
      router.push(`/contents/${job.content_id}`);
    }
  }, [job, router]);

  async function submitBlueprint(bp: Blueprint) {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/api/jobs/${id}/blueprint`, { method: "POST", json: { blueprint: bp } });
      mutate();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!id) return;
    await api(`/api/jobs/${id}/cancel`, { method: "POST" });
    mutate();
  }

  async function retry() {
    if (!id) return;
    await api(`/api/jobs/${id}/retry`, { method: "POST" });
    mutate();
  }

  if (!job) return <p className="text-zinc-500">Chargement…</p>;

  return (
    <div className="grid grid-cols-3 gap-6 max-w-6xl">
      <div className="col-span-1 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{job.keyword}</h1>
          <p className="text-xs text-zinc-500">
            {job.content_type} · {job.status} · ${Number(job.cost_actual).toFixed(4)} /{" "}
            ${job.cost_cap ? Number(job.cost_cap).toFixed(2) : "∞"}
          </p>
        </div>
        <JobTimeline job={job} />
        <div className="flex gap-3 text-xs">
          {(job.status === "running" || job.status === "queued") && (
            <button onClick={cancel} className="text-red-400 hover:underline">
              Annuler le job
            </button>
          )}
          {(job.status === "failed" || job.status === "capped") && (
            <button onClick={retry} className="text-accent-500 hover:underline">
              Relancer (cache préservé)
            </button>
          )}
        </div>
        {job.error && (
          <div className="bg-red-900/30 border border-red-700 text-red-100 p-3 rounded text-sm">
            <div className="font-semibold mb-1">Erreur — étape « {job.current_step || "inconnue"} »</div>
            <div className="text-xs opacity-90">{job.error}</div>
          </div>
        )}
      </div>

      <div className="col-span-2 space-y-4">
        {job.status === "paused" && content?.blueprint ? (
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-3">Blueprint éditorial</h2>
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
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 text-sm space-y-2">
      <h2 className="text-base font-semibold">Audit des étapes</h2>
      <ul className="space-y-1 font-mono text-xs">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="text-zinc-500">[{new Date(s.ts * 1000).toLocaleTimeString()}]</span>{" "}
            <span className="text-accent-500">{s.step}</span> → {s.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
