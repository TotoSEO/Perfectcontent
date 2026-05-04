"use client";

import { Job } from "@/lib/types";

const STEPS = [
  "serp",
  "scrape",
  "parse",
  "analyze",
  "blueprint",
  "generate",
  "image",
  "link",
  "score",
];

export function JobTimeline({ job }: { job: Job }) {
  const stepStatus = new Map<string, string>();
  for (const e of job.audit?.steps || []) {
    stepStatus.set(e.step, e.status);
  }
  const currentIdx = job.current_step ? STEPS.indexOf(job.current_step) : -1;

  return (
    <ol className="space-y-2">
      {STEPS.map((step, i) => {
        const status = stepStatus.get(step);
        const isCurrent = i === currentIdx && job.status === "running";
        const isDone = status === "done";
        const isFailed = status === "failed";
        return (
          <li
            key={step}
            className={`flex items-center gap-3 px-3 py-2 rounded border ${
              isFailed
                ? "border-red-700 bg-red-900/20"
                : isCurrent
                ? "border-accent-500 bg-accent-500/10"
                : isDone
                ? "border-ink-700 bg-ink-900"
                : "border-ink-800 bg-ink-900/40 text-zinc-500"
            }`}
          >
            <span className="w-5 text-center text-xs">
              {isFailed ? "✕" : isDone ? "✓" : isCurrent ? "…" : i + 1}
            </span>
            <span className="text-sm capitalize">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
