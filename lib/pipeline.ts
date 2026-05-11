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
      res = await api<StepResult>(`/srv/jobs/${jobId}/step/${current}`, { method: "POST" });
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

/**
 * Silo orchestration:
 *  1. Drive every member job through SERP -> blueprint (parallel, all auto-paused).
 *     Jobs already at status="paused" / "done" are detected and skipped so a
 *     resumed orchestration (after a tab refresh, network glitch, or manual
 *     trigger) doesn't waste 60-90s re-running cached steps.
 *  2. Build link manifest server-side (cosine on blueprint embeddings).
 *  3. Drive satellites through `generate` ... `score` (parallel).
 *  4. Drive the pillar last (it links to every satellite).
 *  5. Validate the mesh (parse HTML, count links per pair, persist audit).
 */
export async function runSiloToCompletion(
  siloId: string,
  members: { jobId: string; role: "pillar" | "satellite" | string | null }[],
  opts: {
    onJob?: (jobId: string, status: string, step?: Step) => void;
    onPhase?: (phase: "blueprint" | "manifest" | "satellites" | "pillar" | "validate" | "done", info?: any) => void;
    cancelled?: () => boolean;
  } = {},
): Promise<{ status: "done" | "partial" | "failed" | "cancelled"; error?: string; audit?: any }> {
  const allJobs = members.map((m) => m.jobId);

  // Phase 1 — every job up to blueprint (auto-paused thanks to mode=silo).
  // Smart resume: a paused job has already completed serp→blueprint, no point
  // re-running. We fetch each job's current state and short-circuit the
  // pipeline for jobs that are already past it.
  opts.onPhase?.("blueprint");
  const phase1 = await Promise.all(
    allJobs.map(async (jobId) => {
      try {
        const job = await api<{
          status: string;
          current_step: string | null;
          error: string | null;
        }>(`/srv/jobs/${jobId}`);
        // Already past the blueprint pause → nothing to do for phase 1
        if (job.status === "paused" || job.status === "done") {
          opts.onJob?.(jobId, job.status, (job.current_step as Step) || undefined);
          return { jobId, status: job.status as "paused" | "done", lastStep: (job.current_step as Step) || undefined };
        }
        // Already failed / capped → don't bother retrying inside phase 1, the
        // user must explicitly re-launch the silo
        if (job.status === "failed" || job.status === "capped") {
          return {
            jobId,
            status: job.status as "failed" | "capped",
            error: job.error || undefined,
          };
        }
      } catch {
        // If the status probe fails, fall through to the regular pipeline
        // run — it'll surface a real error on the first step call.
      }
      const r = await runJobToCompletion(jobId, {
        onStep: (step) => opts.onJob?.(jobId, "running", step),
        cancelled: opts.cancelled,
      });
      opts.onJob?.(jobId, r.status, r.lastStep);
      return { jobId, ...r };
    }),
  );
  if (opts.cancelled?.()) return { status: "cancelled" };
  const stuck = phase1.filter((p) => p.status !== "paused" && p.status !== "done");
  if (stuck.length) {
    return {
      status: "failed",
      error: `${stuck.length} job(s) failed before manifest: ${stuck.map((s) => s.error || s.status).join("; ")}`,
    };
  }

  // Phase 2 — build link manifest
  opts.onPhase?.("manifest");
  try {
    await api(`/srv/silos/${siloId}/manifest`, { method: "POST" });
  } catch (e) {
    return { status: "failed", error: `manifest build failed: ${e}` };
  }

  // Phase 3 — satellites in parallel through `generate` ... `score`.
  // Same smart-resume: satellites already done (or stuck failed/capped) are
  // skipped so a resumed orchestration doesn't redo work.
  opts.onPhase?.("satellites");
  const sats = members.filter((m) => m.role === "satellite");
  const satResults = await Promise.all(
    sats.map(async (m) => {
      try {
        const job = await api<{ status: string; current_step: string | null; error: string | null }>(
          `/srv/jobs/${m.jobId}`,
        );
        if (job.status === "done") {
          opts.onJob?.(m.jobId, "done", (job.current_step as Step) || undefined);
          return { status: "done" as const, lastStep: (job.current_step as Step) || undefined, jobId: m.jobId };
        }
        if (job.status === "failed" || job.status === "capped") {
          return { status: job.status as "failed" | "capped", error: job.error || undefined, jobId: m.jobId };
        }
      } catch {
        /* ignore probe error, fall through */
      }
      const r = await runJobToCompletion(m.jobId, {
        fromStep: "generate",
        onStep: (step) => opts.onJob?.(m.jobId, "running", step),
        cancelled: opts.cancelled,
      });
      opts.onJob?.(m.jobId, r.status, r.lastStep);
      return { ...r, jobId: m.jobId };
    }),
  );
  if (opts.cancelled?.()) return { status: "cancelled" };

  // Phase 4 — pillar last (so it can link to every satellite). Skipped if
  // already done.
  const pillar = members.find((m) => m.role === "pillar");
  if (pillar) {
    opts.onPhase?.("pillar");
    let alreadyDone = false;
    try {
      const job = await api<{ status: string }>(`/srv/jobs/${pillar.jobId}`);
      if (job.status === "done") {
        opts.onJob?.(pillar.jobId, "done");
        alreadyDone = true;
      } else if (job.status === "failed" || job.status === "capped") {
        return { status: "failed", error: `pillar ${job.status}` };
      }
    } catch {
      /* ignore probe error, fall through */
    }
    if (!alreadyDone) {
      const r = await runJobToCompletion(pillar.jobId, {
        fromStep: "generate",
        onStep: (step) => opts.onJob?.(pillar.jobId, "running", step),
        cancelled: opts.cancelled,
      });
      opts.onJob?.(pillar.jobId, r.status, r.lastStep);
      if (r.status === "failed" || r.status === "capped") {
        return { status: "failed", error: `pillar ${r.status}: ${r.error ?? ""}` };
      }
    }
  }

  // Phase 5 — validate mesh
  opts.onPhase?.("validate");
  let audit: any = null;
  try {
    audit = await api(`/srv/silos/${siloId}/validate`, { method: "POST" });
  } catch (e) {
    return { status: "partial", error: `validate failed: ${e}` };
  }
  opts.onPhase?.("done", audit);
  const anySatFailed = satResults.some((r) => r.status === "failed" || r.status === "capped");
  return {
    status: audit?.ok && !anySatFailed ? "done" : "partial",
    audit,
  };
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
