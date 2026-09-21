#!/usr/bin/env node
/**
 * gaa - drive a GitHub account to every earnable profile achievement tier.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BADGES, BACKFILL_LAG_NOTE, CONFIRM_THRESHOLD, tierFor, nextTier } from './config.js';
import { preflight, FAIL } from './preflight.js';
import { getCount, loadState, recordCycle, STATE_FILE } from './state.js';
import { buildPlan, describePlan, DEFAULT_TARGETS } from './plan.js';
import { loadSettings } from './settings.js';
import { formatDuration } from './throttle.js';
import { bar, bold, cyan, dim, green, heading, line, red, yellow } from './ui.js';

import * as quickdrawBadge from './badges/quickdraw.js';
import * as yoloBadge from './badges/yolo.js';
import * as pullSharkBadge from './badges/pull-shark.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

const PLANNED = { 'galaxy-brain': 'phase 2', verify: 'phase 3' };

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inlineValue] = arg.slice(2).split('=');
    const next = argv[i + 1];
    if (inlineValue !== undefined) {
      flags.set(name, inlineValue);
    } else if (next && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { flags, positional };
}

function usage() {
  return [
    bold(`gaa ${pkg.version}`),
    dim(pkg.description),
    '',
    bold('Usage'),
    '  gaa <command> [options]',
    '',
    bold('Commands'),
    '  status                 Preflight checks and per-badge progress',
    '  plan                   Show the ordered work plan without running it',
    '  run                    Run the full plan, cheapest badge first',
    '  quickdraw              Open and immediately close one issue',
    '  yolo                   Merge one PR with no review',
    '  pull-shark             Run merge cycles toward a Pull Shark tier',
    '  help, version',
    '',
    bold('Planned'),
    ...Object.entries(PLANNED).map(([name, phase]) => `  ${name.padEnd(22)}${dim(`(${phase})`)}`),
    '',
    bold('Options'),
    '  --dry-run              Print operations without executing them',
    '  --yes                  Skip the confirmation on long runs',
    '  --target <tier>        base | bronze | silver | gold  (default gold)',
    '  --limit <n>            Cap the number of cycles this invocation runs',
    '  --interval <seconds>   Seconds between cycles (default 25)',
    '  --no-coauthor          Do not add a Co-authored-by trailer',
    '  --json                 Machine-readable output (status only)',
    '',
    dim('Badge requirements: ACHIEVEMENTS.md   Roadmap: PLAN.md'),
  ].join('\n');
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** Turn CLI flags into settings overrides. */
function overridesFrom(flags) {
  const overrides = {};
  if (flags.has('interval')) overrides.intervalMs = Number(flags.get('interval')) * 1000;
  if (flags.has('merge-method')) overrides.mergeMethod = String(flags.get('merge-method'));
  return overrides;
}

/** Preflight, settings and state, or null when something blocks the run. */
async function setup({ requireClean = false } = {}, flagOverrides = {}) {
  const result = await preflight({ requireClean });
  for (const c of result.checks) {
    if (c.level !== 'ok') console.log(line(c.level, c.label, c.detail));
  }
  if (!result.ok) {
    const blockers = result.checks.filter((c) => c.level === FAIL).map((c) => c.label);
    console.error(`\n${red('Blocked:')} ${blockers.join(', ')}`);
    return null;
  }
  const ctx = {
    ...result.context,
    defaultBranch: result.context.defaultBranch,
    root: result.context.root,
  };
  const settings = loadSettings(ctx.root, flagOverrides);
  const state = loadState(ctx.root, ctx.repo?.nameWithOwner);
  return { ctx, settings, state };
}

function badgeRows(state, repo) {
  return Object.entries(BADGES).map(([key, badge]) => {
    const count = key === 'starstruck' ? (repo?.stargazerCount ?? 0) : getCount(state, key);
    return { key, badge, count, earned: tierFor(key, count), next: nextTier(key, count) };
  });
}

async function status(flags) {
  const result = await preflight();
  const state = loadState(result.context.root, result.context.repo?.nameWithOwner);

  if (flags.has('json')) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          login: result.context.login,
          repo: result.context.repo?.nameWithOwner ?? null,
          checks: result.checks,
          badges: badgeRows(state, result.context.repo).map(({ key, count, earned, next }) => ({
            badge: key,
            count,
            earnedTier: earned,
            nextTier: next?.tier ?? null,
            remaining: next?.remaining ?? 0,
          })),
        },
        null,
        2,
      ),
    );
    return result.ok ? 0 : 1;
  }

  console.log(heading('Preflight'));
  for (const c of result.checks) console.log(line(c.level, c.label, c.detail));

  console.log(heading('Badges'));
  for (const { badge, count, earned, next } of badgeRows(state, result.context.repo)) {
    const target = next?.need ?? badge.thresholds.gold ?? badge.thresholds.base;
    const goal = next ? `${count}/${next.need} to ${next.tier}` : `${count} - maxed`;
    const tierLabel = earned ? cyan(earned.toUpperCase()) : dim('none');
    const note = badge.automated ? '' : yellow(` needs ${badge.needs}`);
    console.log(
      `  ${badge.title.padEnd(20)} ${dim(bar(count, target))} ${dim(goal.padEnd(22))} ${tierLabel}${note}`,
    );
  }

  console.log('');
  console.log(dim(`Counts come from ${STATE_FILE} - what this tool has done, not what`));
  console.log(dim('GitHub has awarded. Profile verification lands in phase 3.'));
  console.log(dim(BACKFILL_LAG_NOTE));

  if (!result.ok) {
    const blockers = result.checks.filter((c) => c.level === FAIL).map((c) => c.label);
    console.log(`\n${yellow('Blocked:')} ${blockers.join(', ')}`);
  }
  return result.ok ? 0 : 1;
}

function planFrom(state, settings, flags) {
  const targets = { ...DEFAULT_TARGETS };
  if (flags.has('target')) {
    const tier = String(flags.get('target'));
    targets['pull-shark'] = tier;
    targets['pair-extraordinaire'] = tier === 'gold' ? 'gold' : tier;
  }
  const coauthor = flags.has('no-coauthor') ? null : settings.coauthor;
  return buildPlan({ state, targets, intervalMs: settings.intervalMs, coauthor });
}

async function planCommand(flags) {
  const env = await setup({}, overridesFrom(flags));
  if (!env) return 1;
  const plan = planFrom(env.state, env.settings, flags);
  console.log(heading('Plan (cheapest first)'));
  console.log(describePlan(plan));
  console.log('');
  console.log(dim(BACKFILL_LAG_NOTE));
  return 0;
}

function progressLine({ done, total, index, result, remainingMs }) {
  const pct = `${done}/${total}`;
  const pr = result.prNumber ? `#${result.prNumber}` : '';
  return `  ${dim(bar(done, total))} ${pct.padEnd(12)} cycle ${index} ${dim(pr)} ${dim(`eta ${formatDuration(remainingMs)}`)}`;
}

async function runCampaign(env, task, flags) {
  const { ctx, state, settings } = env;
  const limit = flags.has('limit') ? Number(flags.get('limit')) : Infinity;
  const dryRun = flags.has('dry-run');

  const coauthoredToRun = Math.min(task.coauthoredCycles, limit);
  const plainToRun = Math.min(task.plainCycles, Math.max(0, limit - coauthoredToRun));

  for (const [count, coauthor] of [
    [coauthoredToRun, task.coauthor],
    [plainToRun, null],
  ]) {
    if (count <= 0) continue;
    await pullSharkBadge.run(ctx, {
      state,
      count,
      coauthor,
      mergeMethod: settings.mergeMethod,
      intervalMs: settings.intervalMs,
      dryRun,
      onProgress: (p) => console.log(progressLine(p)),
    });
  }
}

async function runCommand(flags) {
  const env = await setup({}, overridesFrom(flags));
  if (!env) return 1;

  const plan = planFrom(env.state, env.settings, flags);
  if (!plan.tasks.length) {
    console.log(green('Nothing to do - every targeted badge is already at its target tier.'));
    return 0;
  }

  console.log(heading('Plan (cheapest first)'));
  console.log(describePlan(plan));

  const dryRun = flags.has('dry-run');
  const totalCycles = plan.cycles;
  if (!dryRun && totalCycles >= CONFIRM_THRESHOLD && !flags.has('yes')) {
    const ok = await confirm(
      `\nThis runs ${totalCycles} merge cycles over ~${formatDuration(plan.totalMs)}. Continue?`,
    );
    if (!ok) {
      console.log('Aborted.');
      return 1;
    }
  }

  for (const task of plan.tasks) {
    if (task.kind === 'quickdraw') {
      console.log(heading('Quickdraw'));
      const result = await quickdrawBadge.run(env.ctx, { dryRun });
      if (dryRun) {
        console.log(dim(`  would: ${result.steps.join(' -> ')}`));
      } else {
        recordCycle(env.state, 'quickdraw', { issue: result.issueNumber }, env.ctx.root);
        console.log(`  ${green('done')} issue #${result.issueNumber} opened and closed`);
      }
    } else if (task.kind === 'pr-campaign') {
      console.log(heading('PR campaign'));
      await runCampaign(env, task, flags);
    }
  }

  console.log('');
  console.log(dim(BACKFILL_LAG_NOTE));
  return 0;
}

async function quickdrawCommand(flags) {
  const env = await setup({}, overridesFrom(flags));
  if (!env) return 1;
  if (getCount(env.state, 'quickdraw') > 0 && !flags.has('force')) {
    console.log(green('Quickdraw already done. Re-run with --force to do it again.'));
    return 0;
  }
  const result = await quickdrawBadge.run(env.ctx, { dryRun: flags.has('dry-run') });
  if (result.dryRun) {
    console.log(dim(`would: ${result.steps.join(' -> ')}`));
    return 0;
  }
  recordCycle(env.state, 'quickdraw', { issue: result.issueNumber }, env.ctx.root);
  console.log(`${green('done')} issue #${result.issueNumber} opened and closed`);
  return 0;
}

async function yoloCommand(flags) {
  const env = await setup({}, overridesFrom(flags));
  if (!env) return 1;
  const result = await yoloBadge.run(env.ctx, {
    state: env.state,
    dryRun: flags.has('dry-run'),
    mergeMethod: env.settings.mergeMethod,
  });
  if (result.skipped) {
    console.log(green('YOLO already earned.'));
  } else if (result.dryRun) {
    console.log(dim(`would: ${result.steps.join(' -> ')}`));
  } else {
    console.log(`${green('done')} merged PR #${result.prNumber} with no review`);
  }
  return 0;
}

async function pullSharkCommand(flags) {
  const env = await setup({}, overridesFrom(flags));
  if (!env) return 1;

  const plan = planFrom(env.state, env.settings, flags);
  const task = plan.tasks.find((t) => t.kind === 'pr-campaign');
  if (!task) {
    console.log(green('Pull Shark is already at the requested tier.'));
    return 0;
  }

  const limit = flags.has('limit') ? Number(flags.get('limit')) : task.cycles;
  const cycles = Math.min(limit, task.cycles);
  const dryRun = flags.has('dry-run');

  if (!dryRun && cycles >= CONFIRM_THRESHOLD && !flags.has('yes')) {
    const ok = await confirm(
      `This runs ${cycles} merge cycles over ~${formatDuration(cycles * env.settings.intervalMs)}. Continue?`,
    );
    if (!ok) {
      console.log('Aborted.');
      return 1;
    }
  }

  await runCampaign(env, task, new Map([...flags, ['limit', cycles]]));
  console.log('');
  console.log(dim(BACKFILL_LAG_NOTE));
  return 0;
}

async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const command = positional[0] ?? 'status';

  switch (command) {
    case 'status':
      return status(flags);
    case 'plan':
      return planCommand(flags);
    case 'run':
      return runCommand(flags);
    case 'quickdraw':
      return quickdrawCommand(flags);
    case 'yolo':
      return yoloCommand(flags);
    case 'pull-shark':
      return pullSharkCommand(flags);
    case 'help':
      console.log(usage());
      return 0;
    case 'version':
      console.log(pkg.version);
      return 0;
    default:
      if (PLANNED[command]) {
        console.error(`${command} is not implemented yet (${PLANNED[command]}).`);
        return 1;
      }
      console.error(`Unknown command: ${command}\n`);
      console.error(usage());
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(red(error.message));
    process.exitCode = 1;
  });
