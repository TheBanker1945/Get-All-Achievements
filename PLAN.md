# Implementation Plan

Goal: a Node.js CLI (`gaa`) that drives a GitHub account to every earnable achievement
tier that can be earned without deceiving other people. See `ACHIEVEMENTS.md` for the
badge reference this plan is built from.

## Scope

| Badge | Target | Automated? |
|---|---|---|
| 🦈 Pull Shark | Gold (1,024) | Fully |
| ⚡ Quickdraw | Base | Fully |
| 😬 YOLO | Base | Fully |
| 🤝 Pair Extraordinaire | Gold (48) | Fully (needs alt account's noreply email) |
| 🧠 Galaxy Brain | Gold (32) | Fully (needs alt account token) |
| ⭐ Starstruck | Base (16) | Report-only — cannot be honestly automated |
| ❤️ Public Sponsor | Base | Manual checklist + verification |

## Architecture

```
package.json          bin: gaa · ESM · node >= 20 · no runtime deps
src/
  cli.js              command dispatch, --dry-run, --yes, --limit
  preflight.js        gh installed/authed · repo owned by you · public · not a fork
  gh.js               execFile wrapper over git + gh (array args, never a shell string)
  throttle.js         token bucket + exponential backoff on secondary rate limits
  state.js            .gaa-state.json — resumable progress ledger
  verify.js           scrape profile achievements tab, report earned vs target
  badges/
    pull-shark.js  quickdraw.js  yolo.js
    pair-extraordinaire.js  galaxy-brain.js
    starstruck.js  public-sponsor.js   (report-only)
```

## Badge mechanics

**Pull Shark** — loop N times: branch `gaa/ps-<n>` → append one line to `.gaa/ledger.md`
→ push → `gh pr create --fill` → `gh pr merge --squash --delete-branch`.

**Quickdraw** — `gh issue create` then `gh issue close` in the same call. ~5 seconds.

**YOLO** — a normal merge with no review request; falls out of the first Pull Shark PR,
but gets its own command so it can be earned standalone.

**Pair Extraordinaire** — same loop as Pull Shark, with a
`Co-authored-by: <alt-name> <ID+alt@users.noreply.github.com>` trailer in the commit body.
The alt account only has to *exist* — no token needed, just its noreply address.

**Galaxy Brain** — needs Discussions with a Q&A category. Alt token opens a question,
primary replies, alt marks the reply as the answer via
`gh api graphql` → `markDiscussionCommentAsAnswer`. Repeat to 32.

**Starstruck / Public Sponsor** — `gaa status` reports current stars and sponsor state and
prints what's left; no automation.

## The constraint that drives the design: rate limits

GitHub's secondary rate limit is roughly **80 content-creating requests/minute and
500/hour**. One Pull Shark cycle is ~3 of them (push, create, merge), so the safe ceiling
is ~150 cycles/hour.

- Default pace: **one cycle per 25s** (~144/hr).
- Gold Pull Shark (1,024) therefore runs **~7 hours**. It must be resumable, not a
  single blocking invocation.
- On HTTP 403 with a secondary-rate-limit body: back off exponentially, respect
  `Retry-After`, persist state, continue.

## Safety rails

- Preflight **refuses to run against a repo the authenticated user doesn't own**, so the
  tool can't be pointed at someone else's project.
- `--dry-run` prints the full plan of operations without executing.
- Runs over 50 cycles require `--yes` or an interactive confirmation.
- `gaa status` never writes anything.

Automated bulk PR activity on *your own* repo is ordinary self-serve use, but note that
GitHub's Acceptable Use Policies do prohibit inauthentic activity aimed at other users —
which is why Starstruck is report-only here rather than a star-exchange feature.

## Phases

| Phase | Deliverable | Status |
|---|---|---|
| **0** | Install `gh`. Scaffold package, `gh.js`, `preflight.js`, `state.js`, `throttle.js`, `gaa status`. | **done** |
| **1** | `pr-cycle.js`, `quickdraw`, `yolo`, `pull-shark`, `plan`/`run` orchestrator, test suite. | **done** |
| **2** | `galaxy-brain` (alt token + GraphQL `markDiscussionCommentAsAnswer`). | next |
| **3** | `verify.js` profile scrape, Starstruck/Sponsor reporting in `gaa status`. | |
| **4** | `npx get-all-achievements` publish, CI smoke test. | |

Pair Extraordinaire was folded into phase 1 rather than phase 2: it needs only the alt
account's noreply address, not a token, so it is a flag on the existing PR cycle.

## Ordering: cheapest badge first

Badges are scheduled by ascending time cost, so the profile starts filling within seconds
instead of after the full run. The scheduler also exploits the fact that **one merged PR
can satisfy three badges at once** — Pull Shark (it merged), YOLO (no review) and Pair
Extraordinaire (co-author trailer) — so the 48 co-authored cycles are a *subset* of the
1,024 Pull Shark cycles, not 1,072 cycles in total.

```
  Quickdraw           1 issue open+close        ~5s
  PR campaign         1024 cycles (48 co-authored + 976 plain)   ~7h 6m
      cycle    1  YOLO BASE                      (~25s in)
      cycle    1  Pair Extraordinaire BASE       (~25s in)
      cycle    2  Pull Shark BASE                (~50s in)
      cycle   10  Pair Extraordinaire BRONZE     (~4m in)
      cycle   16  Pull Shark BRONZE              (~7m in)
      cycle   24  Pair Extraordinaire SILVER     (~10m in)
      cycle   48  Pair Extraordinaire GOLD       (~20m in)
      cycle  128  Pull Shark SILVER              (~53m in)
      cycle 1024  Pull Shark GOLD                (~7h 6m in)
```

Six of the seven tiers land in the first 20 minutes. Only Pull Shark Gold needs the long
tail.

## Open risks

- **No public API exposes achievements**, so verification scrapes the profile page and is
  inherently fragile. `gaa status` must degrade gracefully, not crash.
- Badge award is a **backfill job with up to ~24h of lag**; "not showing yet" is not
  "didn't work". Verification needs to say that clearly.
- Achievements are in public preview — thresholds can move. Keep them in one config
  module, not scattered through the badge files.
