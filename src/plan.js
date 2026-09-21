/**
 * Work ordering.
 *
 * Badges are scheduled cheapest-first, so the profile starts filling up within seconds
 * rather than after a seven-hour run. Two facts drive the shape of the plan:
 *
 *   1. Quickdraw is a single open-and-close and costs about five seconds.
 *   2. One merged PR can satisfy Pull Shark, YOLO and Pair Extraordinaire at once. A
 *      co-authored PR counts for Pull Shark *and* Pair Extraordinaire, so the first 48
 *      cycles of a Pull Shark run are co-authored and Pair Extraordinaire Gold arrives
 *      for free roughly twenty minutes in.
 */

import { BADGES, RATE, TIERS } from './config.js';
import { getCount } from './state.js';
import { formatDuration } from './throttle.js';

const QUICKDRAW_MS = 5_000;

export const DEFAULT_TARGETS = {
  quickdraw: 'base',
  'galaxy-brain': 'gold',
  'pull-shark': 'gold',
  'pair-extraordinaire': 'gold',
};

function threshold(badgeKey, tier) {
  const need = BADGES[badgeKey]?.thresholds?.[tier];
  if (need === undefined) throw new Error(`${badgeKey} has no "${tier}" tier`);
  return need;
}

/**
 * Cycle numbers at which each badge tier completes, in the order they will be crossed.
 * This is what makes "least time first" legible before committing to a long run.
 */
export function milestones({ state, cycles, coauthoredCycles }) {
  const out = [];
  const startPs = getCount(state, 'pull-shark');
  const startPe = getCount(state, 'pair-extraordinaire');

  if (cycles > 0 && getCount(state, 'yolo') === 0) {
    out.push({ cycle: 1, badge: 'yolo', tier: 'base' });
  }

  for (const tier of TIERS) {
    const need = BADGES['pull-shark'].thresholds[tier];
    if (need === undefined || startPs >= need) continue;
    const cycle = need - startPs;
    if (cycle <= cycles) out.push({ cycle, badge: 'pull-shark', tier });
  }

  for (const tier of TIERS) {
    const need = BADGES['pair-extraordinaire'].thresholds[tier];
    if (need === undefined || startPe >= need) continue;
    const cycle = need - startPe;
    if (cycle <= coauthoredCycles) out.push({ cycle, badge: 'pair-extraordinaire', tier });
  }

  return out.sort((a, b) => a.cycle - b.cycle);
}

/**
 * Build an ordered task list for the given targets.
 *
 * Returns { tasks, totalMs, skipped } where tasks are already sorted cheapest-first.
 */
export function buildPlan({
  state,
  targets = DEFAULT_TARGETS,
  intervalMs = RATE.defaultIntervalMs,
  coauthor = null,
  altToken = null,
}) {
  const tasks = [];
  const skipped = [];

  if (targets.quickdraw) {
    if (getCount(state, 'quickdraw') > 0) {
      skipped.push({ badge: 'quickdraw', reason: 'already done' });
    } else {
      tasks.push({ kind: 'quickdraw', badge: 'quickdraw', estMs: QUICKDRAW_MS });
    }
  }

  if (targets['galaxy-brain']) {
    const rounds = Math.max(
      0,
      threshold('galaxy-brain', targets['galaxy-brain']) - getCount(state, 'galaxy-brain'),
    );
    if (!altToken) {
      skipped.push({ badge: 'galaxy-brain', reason: 'no GAA_ALT_TOKEN set' });
    } else if (rounds > 0) {
      tasks.push({
        kind: 'galaxy-brain',
        badge: 'galaxy-brain',
        rounds,
        estMs: rounds * RATE.galaxyRoundMs,
      });
    }
  }

  const psNeeded = targets['pull-shark']
    ? Math.max(0, threshold('pull-shark', targets['pull-shark']) - getCount(state, 'pull-shark'))
    : 0;

  let peNeeded = 0;
  if (targets['pair-extraordinaire']) {
    if (!coauthor) {
      skipped.push({
        badge: 'pair-extraordinaire',
        reason: 'no co-author email configured',
      });
    } else {
      peNeeded = Math.max(
        0,
        threshold('pair-extraordinaire', targets['pair-extraordinaire']) -
          getCount(state, 'pair-extraordinaire'),
      );
    }
  }

  // One campaign covers both badges: co-authored cycles first, plain cycles after.
  const cycles = Math.max(psNeeded, peNeeded);
  const coauthoredCycles = Math.min(peNeeded, cycles);

  if (cycles > 0) {
    tasks.push({
      kind: 'pr-campaign',
      badge: 'pull-shark',
      cycles,
      coauthoredCycles,
      plainCycles: cycles - coauthoredCycles,
      coauthor,
      estMs: cycles * intervalMs,
      milestones: milestones({ state, cycles, coauthoredCycles }),
    });
  }

  tasks.sort((a, b) => a.estMs - b.estMs);
  const totalMs = tasks.reduce((sum, task) => sum + task.estMs, 0);

  return { tasks, totalMs, skipped, cycles, coauthoredCycles };
}

export function describePlan(plan) {
  const lines = [];
  for (const task of plan.tasks) {
    if (task.kind === 'quickdraw') {
      lines.push(`  Quickdraw           1 issue open+close        ~${formatDuration(task.estMs)}`);
    } else if (task.kind === 'galaxy-brain') {
      lines.push(
        `  Galaxy Brain        ${task.rounds} Q&A rounds (alt asks, you answer)   ~${formatDuration(task.estMs)}`,
      );
    } else {
      const co = task.coauthoredCycles
        ? `${task.coauthoredCycles} co-authored + ${task.plainCycles} plain`
        : `${task.cycles} plain`;
      lines.push(`  PR campaign         ${task.cycles} cycles (${co})   ~${formatDuration(task.estMs)}`);
      for (const m of task.milestones) {
        const badge = BADGES[m.badge];
        lines.push(
          `      cycle ${String(m.cycle).padStart(4)}  ${badge.emoji} ${badge.title} ${m.tier.toUpperCase()}` +
            `  (~${formatDuration(m.cycle * (task.estMs / task.cycles))} in)`,
        );
      }
    }
  }
  for (const s of plan.skipped) {
    lines.push(`  ${BADGES[s.badge].title.padEnd(20)}skipped - ${s.reason}`);
  }
  lines.push('');
  lines.push(`  Total: ~${formatDuration(plan.totalMs)}`);
  return lines.join('\n');
}
