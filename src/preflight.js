/**
 * Environment checks run before any badge command.
 *
 * The important one is OWNERSHIP: this tool creates bulk PRs and issues, which is
 * ordinary self-serve activity on your own repo and spam on someone else's. Preflight
 * hard-fails unless the authenticated user owns the target repo.
 */

import { ghPath, currentLogin, repoInfo, git } from './gh.js';

export const OK = 'ok';
export const WARN = 'warn';
export const FAIL = 'fail';

const check = (level, label, detail) => ({ level, label, detail });

export async function preflight({ requireClean = false } = {}) {
  const checks = [];
  const context = { login: null, repo: null, root: null };

  const bin = await ghPath();
  if (!bin) {
    checks.push(
      check(FAIL, 'GitHub CLI', 'gh not found. Install it, then run: gh auth login'),
    );
    return { ok: false, checks, context };
  }
  checks.push(check(OK, 'GitHub CLI', bin === 'gh' ? 'found on PATH' : bin));

  const login = await currentLogin();
  if (!login) {
    checks.push(check(FAIL, 'Authentication', 'not logged in. Run: gh auth login'));
    return { ok: false, checks, context };
  }
  context.login = login;
  checks.push(check(OK, 'Authentication', `signed in as ${login}`));

  try {
    context.root = await git(['rev-parse', '--show-toplevel']);
    checks.push(check(OK, 'Git repository', context.root));
  } catch {
    checks.push(check(FAIL, 'Git repository', 'not inside a git working tree'));
    return { ok: false, checks, context };
  }

  const repo = await repoInfo();
  if (!repo) {
    checks.push(
      check(FAIL, 'GitHub remote', 'could not resolve a GitHub repo for this directory'),
    );
    return { ok: false, checks, context };
  }
  context.repo = repo;
  checks.push(check(OK, 'Repository', repo.nameWithOwner));

  const owner = repo.owner?.login ?? '';
  if (owner.toLowerCase() !== login.toLowerCase()) {
    checks.push(
      check(
        FAIL,
        'Ownership',
        `${repo.nameWithOwner} is owned by ${owner}, not ${login}. ` +
          'This tool only runs against repos you own — bulk PRs on someone ' +
          "else's project is spam.",
      ),
    );
  } else {
    checks.push(check(OK, 'Ownership', `owned by ${login}`));
  }

  if (repo.isFork) {
    checks.push(
      check(FAIL, 'Fork', 'achievements do not count for work done only in a fork'),
    );
  } else {
    checks.push(check(OK, 'Fork', 'not a fork'));
  }

  if (repo.isPrivate) {
    checks.push(
      check(
        WARN,
        'Visibility',
        'repo is private — enable Settings → Profile → ' +
          '"Show private contributions & achievements" or nothing will be credited',
      ),
    );
  } else {
    checks.push(check(OK, 'Visibility', repo.visibility?.toLowerCase() ?? 'public'));
  }

  const dirty = await git(['status', '--porcelain']);
  if (dirty) {
    checks.push(
      check(
        requireClean ? FAIL : WARN,
        'Working tree',
        'uncommitted changes present — badge runs create commits and branches here',
      ),
    );
  } else {
    checks.push(check(OK, 'Working tree', 'clean'));
  }

  const defaultBranch = repo.defaultBranchRef?.name;
  if (defaultBranch) {
    context.defaultBranch = defaultBranch;
    checks.push(check(OK, 'Default branch', defaultBranch));
  } else {
    checks.push(check(FAIL, 'Default branch', 'repository has no commits yet'));
  }

  return { ok: !checks.some((c) => c.level === FAIL), checks, context };
}
