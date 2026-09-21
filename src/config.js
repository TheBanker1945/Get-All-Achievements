/**
 * Achievement thresholds, kept in one place because GitHub Achievements are in
 * public preview and the numbers have moved before. See ACHIEVEMENTS.md.
 */

export const TIERS = ['base', 'bronze', 'silver', 'gold'];

export const BADGES = {
  'pull-shark': {
    emoji: '🦈',
    title: 'Pull Shark',
    unit: 'merged PRs',
    thresholds: { base: 2, bronze: 16, silver: 128, gold: 1024 },
    automated: true,
  },
  'pair-extraordinaire': {
    emoji: '🤝',
    title: 'Pair Extraordinaire',
    unit: 'co-authored merged PRs',
    thresholds: { base: 1, bronze: 10, silver: 24, gold: 48 },
    automated: true,
    needs: 'alt account noreply email',
  },
  'galaxy-brain': {
    emoji: '🧠',
    title: 'Galaxy Brain',
    unit: 'accepted answers',
    thresholds: { base: 2, bronze: 8, silver: 16, gold: 32 },
    automated: true,
    needs: 'alt account token',
  },
  starstruck: {
    emoji: '⭐',
    title: 'Starstruck',
    unit: 'stars',
    thresholds: { base: 16, bronze: 128, silver: 512, gold: 4096 },
    automated: false,
    needs: 'real stars from real people',
  },
  quickdraw: {
    emoji: '⚡',
    title: 'Quickdraw',
    unit: 'fast close',
    thresholds: { base: 1 },
    automated: true,
  },
  yolo: {
    emoji: '😬',
    title: 'YOLO',
    unit: 'unreviewed merge',
    thresholds: { base: 1 },
    automated: true,
  },
  'public-sponsor': {
    emoji: '❤️',
    title: 'Public Sponsor',
    unit: 'sponsorship',
    thresholds: { base: 1 },
    automated: false,
    needs: 'a payment method',
  },
};

/** Pacing. GitHub's secondary rate limit is ~80 content-creating req/min, ~500/hr. */
export const RATE = {
  /** One PR cycle is ~3 content-creating requests, so 25s ≈ 144 cycles/hr. */
  defaultIntervalMs: 25_000,
  minIntervalMs: 5_000,
  maxRetries: 6,
  baseBackoffMs: 60_000,
  maxBackoffMs: 15 * 60_000,
};

/** Runs at or above this many cycles require --yes or an interactive confirm. */
export const CONFIRM_THRESHOLD = 50;

/** Badges are awarded by a backfill job, not synchronously. */
export const BACKFILL_LAG_NOTE =
  'Badges are awarded by a periodic backfill job — allow up to ~24h before a badge appears.';

export function tierFor(badgeKey, count) {
  const badge = BADGES[badgeKey];
  if (!badge) return null;
  let earned = null;
  for (const tier of TIERS) {
    const need = badge.thresholds[tier];
    if (need !== undefined && count >= need) earned = tier;
  }
  return earned;
}

export function nextTier(badgeKey, count) {
  const badge = BADGES[badgeKey];
  if (!badge) return null;
  for (const tier of TIERS) {
    const need = badge.thresholds[tier];
    if (need !== undefined && count < need) return { tier, need, remaining: need - count };
  }
  return null;
}
