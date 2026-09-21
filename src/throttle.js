/**
 * Pacing and retry for content-creating GitHub requests.
 *
 * GitHub's secondary rate limit is roughly 80 content-creating requests per minute and
 * 500 per hour. One PR cycle (push, create, merge) is about three of them, so the safe
 * ceiling is ~150 cycles/hour. Going faster gets the account throttled, not banned, but
 * the backoff below then costs more time than the pacing saved.
 */

import { RATE } from './config.js';
import { CommandError } from './gh.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Paces operations so that consecutive calls are at least `intervalMs` apart. */
export class Throttle {
  constructor(intervalMs = RATE.defaultIntervalMs) {
    this.intervalMs = Math.max(intervalMs, RATE.minIntervalMs);
    this.lastStart = 0;
  }

  async wait() {
    const elapsed = Date.now() - this.lastStart;
    const remaining = this.intervalMs - elapsed;
    if (this.lastStart !== 0 && remaining > 0) await sleep(remaining);
    this.lastStart = Date.now();
  }
}

/**
 * Run `fn`, retrying rate limits and transient GitHub server errors. Anything else
 * (no permission, bad branch, merge conflict) is a real failure and is rethrown
 * immediately — retrying it would just burn the rate limit budget.
 */
export async function withRetry(fn, { onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof CommandError && error.isRetryable;
      if (!retryable || attempt >= RATE.maxRetries) throw error;

      // Rate limits need minutes; a 5xx usually clears in seconds.
      const backoff = error.isTransientServerError
        ? Math.min(RATE.transientBackoffMs * 2 ** attempt, RATE.maxTransientBackoffMs)
        : Math.min(error.retryAfterMs ?? RATE.baseBackoffMs * 2 ** attempt, RATE.maxBackoffMs);
      attempt += 1;
      onRetry?.({ attempt, backoffMs: backoff, error });
      await sleep(backoff);
    }
  }
}

/** Human-readable duration, e.g. "7h 6m". */
export function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
