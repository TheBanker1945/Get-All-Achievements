/**
 * Quickdraw — close an issue or pull request within 5 minutes of opening it.
 *
 * The cheapest badge on offer: one issue, opened and closed back to back. One-shot, no
 * tiers, so this runs once and then reports as already done.
 */

import { gh } from '../gh.js';
import { withRetry } from '../throttle.js';

export const key = 'quickdraw';
export const label = 'Quickdraw';

export async function run(ctx, { dryRun } = {}) {
  const opts = { cwd: ctx.root };
  const title = 'chore(gaa): quickdraw';
  const body =
    'Opened and closed immediately by get-all-achievements to earn the Quickdraw achievement.';

  if (dryRun) {
    return {
      dryRun: true,
      steps: ['gh issue create', 'gh issue close (immediately)'],
    };
  }

  const issueUrl = (
    await withRetry(() =>
      gh(['issue', 'create', '--title', title, '--body', body], opts),
    )
  ).trim();

  const issueNumber = Number(issueUrl.split('/').pop());

  // The whole point is the gap between these two calls being well under five minutes.
  await withRetry(() =>
    gh(['issue', 'close', String(issueNumber), '--comment', 'Closing immediately.'], opts),
  );

  return { issueNumber, issueUrl };
}
