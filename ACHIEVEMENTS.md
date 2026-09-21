# GitHub Profile Achievements — Full Reference

> GitHub Achievements are in **public preview**. Names, thresholds and availability
> have changed before and can change again. Last verified: 2026-09-21.

## Global rules

- Achievements reflect **public** activity only, unless you enable
  *Settings → Profile → **Show private contributions & achievements***.
- Work done **only in a fork** does not count.
- Badges are awarded by a periodic backfill job, not instantly — expect **minutes to
  ~24h** of lag before a badge appears on your profile.
- You can hide the Achievements section, or individual badges, in profile settings.

## Earnable achievements

| Badge | Requirement | Base | Bronze | Silver | Gold |
|---|---|---:|---:|---:|---:|
| 🦈 **Pull Shark** | Open a pull request that gets merged | 2 | 16 | 128 | 1,024 |
| 🤝 **Pair Extraordinaire** | Co-authored commits (`Co-authored-by:` trailer) on a merged PR | 1 | 10 | 24 | 48 |
| 🧠 **Galaxy Brain** | Reply in a GitHub Discussion marked as the accepted answer | 2 | 8 | 16 | 32 |
| ⭐ **Starstruck** | A repository you own reaches N stars | 16 | 128 | 512 | 4,096 |
| ⚡ **Quickdraw** | Close an issue or PR within 5 minutes of opening it | 1 | — | — | — |
| 😬 **YOLO** | Merge a pull request with no review | 1 | — | — | — |
| ❤️ **Public Sponsor** | Publicly sponsor someone via GitHub Sponsors | 1 | — | — | — |

### Per-badge notes

**Pull Shark** — PRs against your *own* repo count. Both the PR and the merge can be
done by you. The cheapest repeatable badge; the only real cost of the Gold tier is
1,024 branch → PR → merge cycles.

**Pair Extraordinaire** — The `Co-authored-by: Name <email>` trailer must resolve to a
*different* GitHub account than the commit author; co-authoring with yourself is not
credited. Practically this needs a **second GitHub account** (its
`ID+username@users.noreply.github.com` address works). Both accounts get credit for the
same commit. Trailer must be in the commit body, after a blank line, and the commit must
land via a **merged PR**.

**Galaxy Brain** — Needs Discussions with a **Q&A-category** question, and the question
author marks your reply as the answer. You *can* enable Discussions on your own repo, but
you need a second account to ask or to accept — one account cannot answer and accept its
own question for credit. **No longer awarded from the `github/community` discussions.**

**Starstruck** — The only badge you cannot self-serve. Requires 16 real stars from real
accounts. Star-for-star rings / buying stars violate GitHub's Acceptable Use Policies and
risk account action — this one has to be earned by shipping something people want.

**Quickdraw** — One shot, ~30 seconds of work. Open an issue, close it immediately.

**YOLO** — Merge any PR without requesting/receiving a review. Default on a solo repo, so
usually unlocked as a side effect of the first Pull Shark PR.

**Public Sponsor** — Requires a real payment method and sponsoring a real maintainer
(min. ~$1/mo). Cannot be automated; it is a genuine purchase decision.

## Retired — no longer earnable

| Badge | Was earned by |
|---|---|
| 🧊 **Arctic Code Vault Contributor** | Code in a repo captured by the 2020 GitHub Archive Program |
| 🚀 **Mars 2020 Contributor** | Code in a repo used by the Mars 2020 Helicopter Mission |

## Announced but never shipped

**Heart On Your Sleeve** and **Open Sourcerer** appear in GitHub's achievement asset set
with Bronze/Silver/Gold tiers, but have never been awarded and have no published criteria.

## Profile "Highlights" (not achievements)

These render in a separate section of the profile and are status/membership markers:

| Highlight | How |
|---|---|
| **Pro** | Active GitHub Pro subscription |
| **Developer Program Member** | Join the GitHub Developer Program (free) |
| **Security Bug Bounty Hunter** | Valid report to the GitHub Security Bug Bounty |
| **GitHub Campus Expert** | Accepted into the Campus Experts program (students) |
| **Security Advisory Credit** | Credited on an advisory accepted into the GitHub Advisory Database |

## Feasibility summary

| Tier | Badges | What it takes |
|---|---|---|
| **Solo, scriptable** | Pull Shark (all tiers), Quickdraw, YOLO | This repo's tooling + `gh` |
| **Needs a 2nd account** | Pair Extraordinaire (all tiers), Galaxy Brain (all tiers) | A throwaway/alt account you control |
| **Needs money** | Public Sponsor, Pro highlight | A payment method |
| **Needs other people** | Starstruck | Real project traction |
| **Impossible** | Arctic Code Vault, Mars 2020, Heart On Your Sleeve, Open Sourcerer | — |

## Sources

- <https://github.com/drknzz/GitHub-Achievements>
- <https://github.com/Schweinepriester/github-profile-achievements>
- <https://github.com/orgs/community/discussions/176080>
- <https://docs.github.com/en/account-and-profile>
