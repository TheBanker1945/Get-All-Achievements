/**
 * Thin wrapper over the `gh` and `git` executables.
 *
 * Every call passes arguments as an array to execFile — never a shell string — so
 * branch names, issue titles and commit bodies can't break out into the shell.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Where to look when `gh` isn't on PATH — which is the normal state immediately after
 * a winget/msi install, since the running shell has a stale PATH.
 */
function fallbackPaths() {
  const windowsRoots = [
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'),
  ].filter(Boolean);

  return [
    ...windowsRoots.map((root) => join(root, 'GitHub CLI', 'gh.exe')),
    '/usr/bin/gh',
    '/usr/local/bin/gh',
    '/opt/homebrew/bin/gh',
  ];
}

let cachedGhPath;

export class CommandError extends Error {
  constructor(command, args, cause) {
    const stderr = (cause.stderr || '').trim();
    const stdout = (cause.stdout || '').trim();
    super(`${command} ${args.join(' ')} failed: ${stderr || stdout || cause.message}`);
    this.name = 'CommandError';
    this.command = command;
    this.args = args;
    this.exitCode = typeof cause.code === 'number' ? cause.code : 1;
    this.stderr = stderr;
    this.stdout = stdout;
  }

  /**
   * GitHub answers abuse-detection trips with 403 plus a distinctive body. These are
   * retryable after a wait; ordinary 403s (no permission) are not.
   */
  get isSecondaryRateLimit() {
    return /secondary rate limit|abuse detection|exceeded a secondary/i.test(this.stderr);
  }

  get isPrimaryRateLimit() {
    return /API rate limit exceeded/i.test(this.stderr);
  }

  get retryAfterMs() {
    const match = /retry[- ]after[:\s]+(\d+)/i.exec(this.stderr);
    return match ? Number(match[1]) * 1000 : null;
  }
}

/** Locate the gh executable, falling back to known install paths when PATH is stale. */
export async function ghPath() {
  if (cachedGhPath !== undefined) return cachedGhPath;
  try {
    await run('gh', ['--version']);
    cachedGhPath = 'gh';
    return cachedGhPath;
  } catch {
    // PATH may not have been refreshed since install; try the usual locations.
  }
  for (const candidate of fallbackPaths()) {
    if (!existsSync(candidate)) continue;
    try {
      await run(candidate, ['--version']);
      cachedGhPath = candidate;
      return cachedGhPath;
    } catch {
      // Present but unusable — keep looking.
    }
  }
  cachedGhPath = null;
  return cachedGhPath;
}

async function exec(command, args, options = {}) {
  try {
    const { stdout } = await run(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (cause) {
    throw new CommandError(command, args, cause);
  }
}

/** Run `gh` with the given args, returning stdout. */
export async function gh(args, options = {}) {
  const bin = await ghPath();
  if (!bin) {
    throw new Error('GitHub CLI (gh) not found. Install it, then run: gh auth login');
  }
  return exec(bin, args, options);
}

/** Run `gh` and parse stdout as JSON. */
export async function ghJson(args, options = {}) {
  const stdout = await gh(args, options);
  return JSON.parse(stdout);
}

/** Run `git`, returning trimmed stdout. */
export async function git(args, options = {}) {
  const stdout = await exec('git', args, options);
  return stdout.trim();
}

/** The authenticated login, or null when gh is unauthenticated. */
export async function currentLogin(options = {}) {
  try {
    return (await gh(['api', 'user', '--jq', '.login'], options)).trim();
  } catch {
    return null;
  }
}

/** Metadata for the repo in cwd, or null when cwd isn't a recognised GitHub repo. */
export async function repoInfo(options = {}) {
  try {
    return await ghJson(
      [
        'repo',
        'view',
        '--json',
        'name,owner,isFork,isPrivate,visibility,stargazerCount,hasDiscussionsEnabled,defaultBranchRef,nameWithOwner,url',
      ],
      options,
    );
  } catch {
    return null;
  }
}
