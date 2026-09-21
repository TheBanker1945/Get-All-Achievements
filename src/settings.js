/**
 * Settings resolution: gaa.config.json in the repo root, overridden by environment,
 * overridden by CLI flags.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RATE } from './config.js';
import { coauthorName } from './badges/pr-cycle.js';

export const CONFIG_FILE = 'gaa.config.json';

const DEFAULTS = {
  coauthor: null,
  intervalMs: RATE.defaultIntervalMs,
  mergeMethod: 'squash',
};

function normaliseCoauthor(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return { name: coauthorName(value), email: value };
  }
  if (!value.email) return null;
  return { name: value.name || coauthorName(value.email), email: value.email };
}

export function loadSettings(root, overrides = {}) {
  let fileConfig = {};
  const path = join(root ?? process.cwd(), CONFIG_FILE);
  if (existsSync(path)) {
    try {
      fileConfig = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new Error(`${CONFIG_FILE} is not valid JSON: ${error.message}`);
    }
  }

  const merged = {
    ...DEFAULTS,
    ...fileConfig,
    ...(process.env.GAA_COAUTHOR ? { coauthor: process.env.GAA_COAUTHOR } : {}),
    ...(process.env.GAA_INTERVAL_MS ? { intervalMs: Number(process.env.GAA_INTERVAL_MS) } : {}),
    ...overrides,
  };

  merged.coauthor = normaliseCoauthor(merged.coauthor);
  merged.intervalMs = Math.max(Number(merged.intervalMs) || RATE.defaultIntervalMs, RATE.minIntervalMs);

  if (!['squash', 'merge', 'rebase'].includes(merged.mergeMethod)) {
    throw new Error(`mergeMethod must be squash, merge or rebase (got "${merged.mergeMethod}")`);
  }

  return merged;
}
