import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { tierFor, nextTier } from '../src/config.js';
import { buildPlan, milestones, DEFAULT_TARGETS } from '../src/plan.js';
import { coauthorName, coauthorTrailer } from '../src/badges/pr-cycle.js';
import { loadState, recordCycle, getCount, saveState } from '../src/state.js';
import { loadSettings } from '../src/settings.js';

const COAUTHOR = { name: 'alt', email: '1+alt@users.noreply.github.com' };
const emptyState = () => ({ version: 1, repo: 'o/r', badges: {} });
const tmpDirs = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'gaa-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('tier maths', () => {
  it('reports the highest tier reached, not the next one', () => {
    assert.equal(tierFor('pull-shark', 0), null);
    assert.equal(tierFor('pull-shark', 2), 'base');
    assert.equal(tierFor('pull-shark', 127), 'bronze');
    assert.equal(tierFor('pull-shark', 1024), 'gold');
    assert.equal(tierFor('pull-shark', 99999), 'gold');
  });

  it('reports remaining work to the next tier', () => {
    assert.deepEqual(nextTier('pull-shark', 0), { tier: 'base', need: 2, remaining: 2 });
    assert.deepEqual(nextTier('pull-shark', 16), { tier: 'silver', need: 128, remaining: 112 });
    assert.equal(nextTier('pull-shark', 1024), null, 'gold is the end of the line');
  });
});

describe('co-author trailers', () => {
  it('derives the username from a noreply address', () => {
    assert.equal(coauthorName('146328616+MoMahdi0799@users.noreply.github.com'), 'MoMahdi0799');
    assert.equal(coauthorName('plain@example.com'), 'plain');
  });

  it('formats a git trailer from a string or an object', () => {
    assert.equal(
      coauthorTrailer('1+alt@users.noreply.github.com'),
      'Co-authored-by: alt <1+alt@users.noreply.github.com>',
    );
    assert.equal(coauthorTrailer(COAUTHOR), 'Co-authored-by: alt <1+alt@users.noreply.github.com>');
    assert.equal(coauthorTrailer(null), null);
  });
});

describe('plan building', () => {
  it('runs one campaign covering both PR badges, not two', () => {
    const plan = buildPlan({ state: emptyState(), coauthor: COAUTHOR });
    const campaign = plan.tasks.find((t) => t.kind === 'pr-campaign');
    // Pull Shark gold is 1024 and Pair Extraordinaire gold is 48; the 48 co-authored
    // cycles are a subset of the 1024, so the campaign is 1024 cycles, not 1072.
    assert.equal(campaign.cycles, 1024);
    assert.equal(campaign.coauthoredCycles, 48);
    assert.equal(campaign.plainCycles, 976);
  });

  it('orders tasks cheapest first', () => {
    const plan = buildPlan({ state: emptyState(), coauthor: COAUTHOR });
    assert.equal(plan.tasks[0].kind, 'quickdraw', 'quickdraw is ~5s and must come first');
    const costs = plan.tasks.map((t) => t.estMs);
    assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
  });

  it('skips pair-extraordinaire when no co-author is configured', () => {
    const plan = buildPlan({ state: emptyState(), coauthor: null });
    const campaign = plan.tasks.find((t) => t.kind === 'pr-campaign');
    assert.equal(campaign.coauthoredCycles, 0);
    assert.ok(plan.skipped.some((s) => s.badge === 'pair-extraordinaire'));
  });

  it('subtracts work already recorded in the ledger', () => {
    const state = emptyState();
    state.badges['pull-shark'] = { completed: 1000 };
    state.badges['pair-extraordinaire'] = { completed: 48 };
    const plan = buildPlan({ state, coauthor: COAUTHOR });
    const campaign = plan.tasks.find((t) => t.kind === 'pr-campaign');
    assert.equal(campaign.cycles, 24);
    assert.equal(campaign.coauthoredCycles, 0, 'pair extraordinaire is already maxed');
  });

  it('omits quickdraw once it is done', () => {
    const state = emptyState();
    state.badges.quickdraw = { completed: 1 };
    const plan = buildPlan({ state, coauthor: COAUTHOR });
    assert.ok(!plan.tasks.some((t) => t.kind === 'quickdraw'));
    assert.ok(plan.skipped.some((s) => s.badge === 'quickdraw'));
  });

  it('honours a lower target tier', () => {
    const plan = buildPlan({
      state: emptyState(),
      targets: { ...DEFAULT_TARGETS, 'pull-shark': 'silver', 'pair-extraordinaire': 'silver' },
      coauthor: COAUTHOR,
    });
    const campaign = plan.tasks.find((t) => t.kind === 'pr-campaign');
    assert.equal(campaign.cycles, 128);
    assert.equal(campaign.coauthoredCycles, 24);
  });
});

describe('milestones', () => {
  it('lists tiers in the order they are crossed', () => {
    const list = milestones({ state: emptyState(), cycles: 1024, coauthoredCycles: 48 });
    const cycles = list.map((m) => m.cycle);
    assert.deepEqual(cycles, [...cycles].sort((a, b) => a - b));
    assert.deepEqual(list[0], { cycle: 1, badge: 'yolo', tier: 'base' });
  });

  it('does not promise pair-extraordinaire tiers beyond the co-authored cycles', () => {
    const list = milestones({ state: emptyState(), cycles: 1024, coauthoredCycles: 10 });
    const pe = list.filter((m) => m.badge === 'pair-extraordinaire').map((m) => m.tier);
    assert.deepEqual(pe, ['base', 'bronze'], 'silver needs 24 co-authored cycles');
  });

  it('skips yolo once earned', () => {
    const state = emptyState();
    state.badges.yolo = { completed: 1 };
    const list = milestones({ state, cycles: 10, coauthoredCycles: 0 });
    assert.ok(!list.some((m) => m.badge === 'yolo'));
  });
});

describe('state ledger', () => {
  it('persists each cycle so an interrupted run resumes', () => {
    const root = tmp();
    const state = loadState(root, 'o/r');
    recordCycle(state, 'pull-shark', { pr: 1 }, root);
    recordCycle(state, 'pull-shark', { pr: 2 }, root);
    assert.equal(getCount(state, 'pull-shark'), 2);
    assert.equal(getCount(loadState(root, 'o/r'), 'pull-shark'), 2, 'survives a reload');
  });

  it('falls back to an empty ledger rather than throwing on corruption', () => {
    const root = tmp();
    writeFileSync(join(root, '.gaa-state.json'), '{ not json', 'utf8');
    assert.equal(getCount(loadState(root, 'o/r'), 'pull-shark'), 0);
  });

  it('discards a ledger written by a different schema version', () => {
    const root = tmp();
    const state = loadState(root, 'o/r');
    state.version = 99;
    state.badges['pull-shark'] = { completed: 5 };
    saveState(state, root);
    assert.equal(getCount(loadState(root, 'o/r'), 'pull-shark'), 0);
  });
});

describe('settings', () => {
  it('normalises a bare co-author string into name and email', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'gaa.config.json'),
      JSON.stringify({ coauthor: '9+bob@users.noreply.github.com' }),
      'utf8',
    );
    assert.deepEqual(loadSettings(root).coauthor, {
      name: 'bob',
      email: '9+bob@users.noreply.github.com',
    });
  });

  it('clamps the interval to the rate-limit floor', () => {
    assert.equal(loadSettings(tmp(), { intervalMs: 1 }).intervalMs, 5000);
  });

  it('rejects an unknown merge method', () => {
    assert.throws(() => loadSettings(tmp(), { mergeMethod: 'yeet' }), /squash, merge or rebase/);
  });

  it('reports invalid config JSON by name', () => {
    const root = tmp();
    writeFileSync(join(root, 'gaa.config.json'), '{{{', 'utf8');
    assert.throws(() => loadSettings(root), /gaa.config.json is not valid JSON/);
  });
});
