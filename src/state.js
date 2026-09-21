/**
 * Resumable progress ledger.
 *
 * A Gold Pull Shark run is ~1,024 cycles at ~25s each — around seven hours. That will
 * be interrupted, so every completed cycle is persisted immediately and runs resume
 * from the last recorded count rather than starting over.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_FILE = '.gaa-state.json';
const STATE_VERSION = 1;

const emptyState = (repo) => ({
  version: STATE_VERSION,
  repo: repo ?? null,
  createdAt: new Date().toISOString(),
  badges: {},
});

function statePath(root) {
  return join(root ?? process.cwd(), STATE_FILE);
}

export function loadState(root, repo) {
  const path = statePath(root);
  if (!existsSync(path)) return emptyState(repo);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed.version !== STATE_VERSION) return emptyState(repo);
    parsed.badges ??= {};
    return parsed;
  } catch {
    // A corrupt ledger shouldn't block a run; the worst case is redoing cycles.
    return emptyState(repo);
  }
}

export function saveState(state, root) {
  const path = statePath(root);
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
  return state;
}

/** Cycles this tool has completed for a badge (not necessarily what GitHub has awarded). */
export function getCount(state, badgeKey) {
  return state.badges[badgeKey]?.completed ?? 0;
}

/** Record one completed cycle and flush to disk. */
export function recordCycle(state, badgeKey, detail = {}, root) {
  const entry = state.badges[badgeKey] ?? { completed: 0, history: [] };
  entry.completed += 1;
  entry.updatedAt = new Date().toISOString();
  entry.last = detail;
  state.badges[badgeKey] = entry;
  saveState(state, root);
  return entry.completed;
}

export function resetBadge(state, badgeKey, root) {
  delete state.badges[badgeKey];
  saveState(state, root);
  return state;
}

export function clearState(root) {
  const path = statePath(root);
  if (existsSync(path)) unlinkSync(path);
}
