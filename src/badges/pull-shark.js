/**
 * Pull Shark — open pull requests that get merged. Base 2, Bronze 16, Silver 128,
 * Gold 1,024.
 *
 * Also the engine for YOLO (the first unreviewed merge) and Pair Extraordinaire (any
 * cycle run with a co-author trailer), since all three are earned by merging PRs.
 */

import { BADGES, RATE } from '../config.js';
import { getCount, recordCycle } from '../state.js';
import { Throttle, formatDuration } from '../throttle.js';
import { assertGitIdentity, runCycle } from './pr-cycle.js';

export const key = 'pull-shark';
export const label = 'Pull Shark';

/** Cycles still needed to reach `target`, given what the ledger already records. */
export function remainingFor(state, badgeKey, target) {
  const need = BADGES[badgeKey].thresholds[target];
  if (need === undefined) throw new Error(`${badgeKey} has no ${target} tier`);
  return Math.max(0, need - getCount(state, badgeKey));
}

export function estimate(count, intervalMs = RATE.defaultIntervalMs) {
  return formatDuration(count * intervalMs);
}

/**
 * Run `count` merge cycles, recording each one as it lands so an interrupted run
 * resumes rather than restarting.
 *
 * `badgeKey` decides which counter advances — 'pull-shark' or 'pair-extraordinaire'.
 * When a co-author is supplied both counters advance, because one co-authored merged PR
 * genuinely counts for both badges.
 */
export async function run(ctx, options = {}) {
  const {
    state,
    count,
    coauthor = null,
    mergeMethod = 'squash',
    intervalMs = RATE.defaultIntervalMs,
    dryRun = false,
    onProgress,
  } = options;

  if (!dryRun) await assertGitIdentity(ctx);

  const throttle = new Throttle(intervalMs);
  const results = [];
  const startCount = getCount(state, key);

  for (let i = 0; i < count; i += 1) {
    const index = startCount + i + 1;
    if (!dryRun) await throttle.wait();

    const result = await runCycle(ctx, {
      label: coauthor ? 'pair' : 'ps',
      index,
      coauthor,
      mergeMethod,
      dryRun,
    });

    if (!dryRun) {
      const detail = { pr: result.prNumber, branch: result.branch, coauthored: Boolean(coauthor) };
      recordCycle(state, key, detail, ctx.root);
      // A merged PR with no review also earns YOLO; record it the first time.
      if (getCount(state, 'yolo') === 0) recordCycle(state, 'yolo', detail, ctx.root);
      if (coauthor) recordCycle(state, 'pair-extraordinaire', detail, ctx.root);
    }

    results.push(result);
    onProgress?.({
      done: i + 1,
      total: count,
      index,
      result,
      remainingMs: (count - i - 1) * intervalMs,
    });
  }

  return results;
}
