/**
 * YOLO — merge a pull request with no review.
 *
 * There is nothing to do beyond merging one PR without requesting a review, which is
 * what every cycle in pull-shark.js already does. This exists so YOLO can be earned on
 * its own without committing to a full Pull Shark run.
 */

import { getCount } from '../state.js';
import { run as runCycles } from './pull-shark.js';

export const key = 'yolo';
export const label = 'YOLO';

export async function run(ctx, { state, dryRun = false, mergeMethod = 'squash' } = {}) {
  if (getCount(state, key) > 0 && !dryRun) {
    return { skipped: true, reason: 'already earned' };
  }
  const [result] = await runCycles(ctx, { state, count: 1, dryRun, mergeMethod });
  return result;
}
