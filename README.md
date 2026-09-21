# Get All Achievements

A CLI that drives a GitHub account toward every **earnable** profile achievement tier —
without pretending to be other people.

> **Status: phase 2.** Every automatable badge has a runner. Profile verification
> (phase 3) is next. See [PLAN.md](PLAN.md).

## What it can and can't do

| Badge | Target | Automated |
|---|---|---|
| 🦈 Pull Shark | Gold (1,024) | yes |
| 🤝 Pair Extraordinaire | Gold (48) | yes — needs an alt account's noreply email |
| 🧠 Galaxy Brain | Gold (32) | yes — needs an alt account token |
| ⚡ Quickdraw | Base | yes |
| 😬 YOLO | Base | yes |
| ⭐ Starstruck | Base (16) | **no** — reported only |
| ❤️ Public Sponsor | Base | **no** — a real payment |

Starstruck needs 16 stars from 16 real people. Automating that means star-exchange rings,
which break GitHub's Acceptable Use Policies and put the account at risk, so this tool
reports your distance to the next tier and otherwise stays out of it.

Full badge reference, including retired and never-shipped badges:
[ACHIEVEMENTS.md](ACHIEVEMENTS.md).

## Requirements

- Node.js >= 20
- [GitHub CLI](https://cli.github.com/), authenticated: `gh auth login`
- A **public, non-fork** repository that **you own**
- If the repo is private: enable *Settings → Profile → Show private contributions & achievements*

## Usage

```sh
git clone https://github.com/TheBanker1945/Get-All-Achievements.git
cd Get-All-Achievements

node src/cli.js status            # preflight + per-badge progress (never writes)
node src/cli.js plan              # the ordered work plan, with ETAs
node src/cli.js run --dry-run     # every operation, executed against nothing
node src/cli.js run --limit 3     # prove it works before the long run
node src/cli.js run --yes         # the whole plan
```

Individual badges: `quickdraw`, `yolo`, `pull-shark --target silver`, `galaxy-brain`.

### Galaxy Brain needs a second account

It is the only badge where another account must actually act, because one account cannot
ask a question and be credited for answering it. Each round: the **alt** opens a Q&A
discussion, **you** reply, the **alt** marks your reply as the answer. Only the reply is
credited, so steps 1 and 3 run under the alt's token.

Create a classic token on the *alt* account with the **`public_repo`** scope, then:

```sh
echo "ghp_xxxx" > .gaa-alt-token      # gitignored
# or: export GAA_ALT_TOKEN=ghp_xxxx
```

A token with no scopes ticked still passes an identity check but cannot create
discussions, which fails with a clear message rather than silently doing nothing.
Putting `altToken` in `gaa.config.json` is refused outright - that file is committed.

Note this creates one public discussion thread per round (32 for Gold). The tool enables
Discussions automatically, but an **answerable** (Q&A) category must exist, since only
answerable categories can have an accepted answer.

### Options

| Flag | Effect |
|---|---|
| `--dry-run` | Print operations without executing them |
| `--target <tier>` | `base` \| `bronze` \| `silver` \| `gold` (default `gold`) |
| `--limit <n>` | Cap cycles for this invocation |
| `--interval <seconds>` | Seconds between cycles (default 25) |
| `--merge-method <m>` | `squash` (default) \| `merge` \| `rebase` |
| `--no-coauthor` | Omit the `Co-authored-by` trailer |
| `--yes` | Skip the confirmation on runs of 50+ cycles |

### Configuration

`gaa.config.json` in the repo root:

```json
{
  "coauthor": { "name": "alt-account", "email": "123+alt@users.noreply.github.com" },
  "intervalMs": 25000,
  "mergeMethod": "squash"
}
```

Use your **alt account's** noreply address (Settings -> Emails on that account). The alt
never has to log in — the trailer just has to resolve to a different GitHub user, because
co-authoring with yourself is not credited.

## Safety rails

- Preflight **hard-fails unless you own the target repo**. Bulk PRs on your own project are
  ordinary self-serve activity; on someone else's they're spam, so the tool won't point
  that way.
- `--dry-run` prints every operation without executing it.
- Runs of 50+ cycles need `--yes` or an interactive confirmation.

## Two things that surprise people

**One PR can earn three badges.** A merged PR is Pull Shark, merging it unreviewed is
YOLO, and a `Co-authored-by` trailer makes the same PR count for Pair Extraordinaire. So
the 48 co-authored cycles are a subset of the 1,024 Pull Shark cycles, and the work is
scheduled cheapest-first: Quickdraw at ~5 seconds, YOLO and Pair Extraordinaire Base at
~25 seconds, Pull Shark Base at ~50 seconds, **Pair Extraordinaire Gold at ~20 minutes**.
Six of seven tiers land inside the first twenty minutes; only Pull Shark Gold needs the
long tail. Run `gaa plan` to see the milestone schedule.

**Pacing is the real constraint.** GitHub's secondary rate limit is ~80 content-creating
requests/minute and ~500/hour. One PR cycle costs about three, so the safe ceiling is
~150 cycles/hour — which makes Gold Pull Shark a **~7 hour run**. It's paced and resumable
by design; progress lives in `.gaa-state.json`.

**Transient failures are not real failures.** GitHub intermittently returns a 5xx or an
opaque `Something went wrong while executing your query`. Those are retried with a short
backoff (5s doubling to 60s). Rate limits get a much longer one. Everything else - merge
conflicts, 403s, 404s - fails immediately and deliberately, because retrying a real error
just burns rate-limit budget.

**Badges lag.** Achievements are granted by a periodic backfill job, not synchronously.
Allow up to ~24h before one shows on your profile. "Not showing yet" is not "didn't work".

Achievements are in public preview, so thresholds can move; they live in
[`src/config.js`](src/config.js) rather than scattered through the badge code.

## Tests

```sh
npm test
```

## License

MIT
