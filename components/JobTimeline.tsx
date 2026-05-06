"use client";

import { Job } from "@/lib/types";
import { Icon } from "@/components/Icon";

const STEPS: { id: string; label: string }[] = [
  { id: "serp", label: "SERP" },
  { id: "scrape", label: "Scrape" },
  { id: "parse", label: "Parse" },
  { id: "analyze", label: "Analyse" },
  { id: "blueprint", label: "Blueprint" },
  { id: "generate", label: "Génération" },
  { id: "image", label: "Image" },
  { id: "link", label: "Maillage" },
  { id: "score", label: "Coverage" },
];

export function JobTimeline({ job }: { job: Job }) {
  const stepStatus = new Map<string, string>();
  for (const e of job.audit?.steps || []) {
    stepStatus.set(e.step, e.status);
  }
  const currentIdx = job.current_step ? STEPS.findIndex((s) => s.id === job.current_step) : -1;

  return (
    <ol className="space-y-1.5">
      {STEPS.map((step, i) => {
        const status = stepStatus.get(step.id);
        const isCurrent = i === currentIdx && job.status === "running";
        const isDone = status === "done";
        const isFailed = status === "failed";

        const tone = isFailed
          ? "border-red-700/50 bg-red-500/10 text-red-200"
          : isCurrent
          ? "border-accent-500/50 bg-accent-500/10 text-accent-200"
          : isDone
          ? "border-[var(--border)] bg-[var(--surface)] text-zinc-300"
          : "border-[var(--border)] bg-[var(--surface)]/50 text-zinc-500";

        const indicator = isFailed ? (
          <Icon name="x" size={12} className="text-red-300" />
        ) : isDone ? (
          <Icon name="check" size={12} className="text-emerald-300" />
        ) : isCurrent ? (
          <Icon name="spinner" size={12} className="text-accent-300" />
        ) : (
          <span className="text-[10px] tabular-nums">{i + 1}</span>
        );

        return (
          <li
            key={step.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${tone}`}
          >
            <span className={`w-5 h-5 inline-flex items-center justify-center rounded-full ${
              isDone ? "bg-emerald-500/15" : isCurrent ? "bg-accent-500/15" : isFailed ? "bg-red-500/15" : "bg-white/[0.04]"
            }`}>
              {indicator}
            </span>
            <span className="text-sm">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
