import { api } from "./api";
import { Job } from "./types";

export const STEPS = [
  "serp",
  "scrape",
  "parse",
  "analyze",
  "blueprint",
  "generate",
  "image",
  "link",
  "score",
] as const;
export type Step = (typeof STEPS)[number];

export type StepResult = {
  ok: boolean;
  step: Step;
  next?: Step | null;
  paused?: boolean;
  capped?: boolean;
  error?: string;
};

/**
 * Drive a single job through the pipeline by calling each step sequentially.
 * Stops on pause (blueprint awaiting validation), failure, or completion.
 *
 * The browser is the orchestrator: each step is a serverless call that
 * persists its result to Postgres before returning.
 */
export async function runJobToCompletion(
  jobId: string,
  opts: {
    fromStep?: Step;
    onStep?: (step: Step, result: StepResult) => void;
    cancelled?: () => boolean;
  } = {}
): Promise<{ status: "done" | "paused" | "failed" | "capped" | "cancelled"; lastStep?: Step; error?: string }> {
  let current: Step | null = opts.fromStep ?? "serp";
  while (current) {
    if (opts.cancelled?.()) return { status: "cancelled", lastStep: current };

    let res: StepResult;
    try {
      res = await api<StepResult>(`/api/jobs/${jobId}/step/${current}`, { method: "POST" });
    } catch (err) {
      return { status: "failed", lastStep: current, error: String(err) };
    }
    opts.onStep?.(current, res);

    if (res.error) return { status: "failed", lastStep: current, error: res.error };
    if (res.capped) return { status: "capped", lastStep: current };
    if (res.paused) return { status: "paused", lastStep: current };
    if (!res.next) return { status: "done", lastStep: current };

    current = res.next;
  }
  return { status: "done" };
}

/** Drive several jobs sequentially. Stops on first paused job (per-batch flow)
 *  unless `continueOnPause` is true. */
export async function runBatch(
  jobs: Pick<Job, "id">[],
  opts: {
    onJobUpdate?: (jobId: string, status: string, step?: Step) => void;
    cancelled?: () => boolean;
    continueOnPause?: boolean;
  } = {}
): Promise<void> {
  for (const job of jobs) {
    if (opts.cancelled?.()) return;
    opts.onJobUpdate?.(job.id, "running", "serp");
    const result = await runJobToCompletion(job.id, {
      onStep: (step) => opts.onJobUpdate?.(job.id, "running", step),
      cancelled: opts.cancelled,
    });
    opts.onJobUpdate?.(job.id, result.status, result.lastStep);
    if (result.status === "paused" && !opts.continueOnPause) return;
    if (result.status === "failed" || result.status === "capped") {
      // Continue to next job — don't block the whole batch on one failure
      continue;
    }
  }
}
