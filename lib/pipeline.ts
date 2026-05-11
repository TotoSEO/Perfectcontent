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
// Per-step client-side timeout. The pipeline's slow steps (generate +
// blueprint = Claude calls on 1500-2500 word outputs) regularly need
// 60-180 s. We give them 4 min on the client to match the Vercel function
// maxDuration we set (300 s). Cheaper steps (serp/scrape/parse/etc.)
// don't need this much but giving them the same budget is harmless.
const STEP_TIMEOUT_MS = 240_000;

// Slow steps that benefit from an automatic single retry on timeout.
// Generate is the most likely to hit the wall (longest Claude call); a
// fresh retry usually completes because the cache from the first attempt
// makes the prompt cheaper and the model is rarely stuck twice in a row.
const RETRY_ON_TIMEOUT_STEPS: Set<Step> = new Set(["generate", "blueprint"]);


function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|aborted/i.test(msg);
}


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
    let attempt = 0;
    const maxAttempts = RETRY_ON_TIMEOUT_STEPS.has(current) ? 2 : 1;
    let lastErr: unknown = null;
    while (attempt < maxAttempts) {
      try {
        res = await api<StepResult>(
          `/srv/jobs/${jobId}/step/${current}`,
          { method: "POST", timeoutMs: STEP_TIMEOUT_MS },
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        attempt++;
        // Only retry on timeout — a 4xx/5xx with content is not going to
        // change on a retry.
        if (attempt >= maxAttempts || !isTimeoutError(err)) break;
      }
    }
    if (lastErr) {
      return { status: "failed", lastStep: current, error: String(lastErr) };
    }
    // res is guaranteed assigned at this point because we either set it
    // and broke, or returned via the error branch.
    res = res!;
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
