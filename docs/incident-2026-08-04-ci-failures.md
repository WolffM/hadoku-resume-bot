# Incident: auto-update pushes rejected by protected main — 10 failures (2026-08-04)

> Written 2026-08-05 by an outside investigation run from `hadoku_site`, working
> only from GitHub Actions logs and commit history — it never ran anything in
> this checkout. Treat every claim below as a **hypothesis to verify against
> this repo's own evidence** before acting on it. Verify first, then fix.

## What the daily CI digest showed

`hadoku-resume-bot / Auto-update @wolffm packages` — **10 failures**, latest run
green. All ten between 21:45 and 22:28 UTC on 2026-08-04, one per inbound
`wolffm_published` dispatch during that evening's publish storm.

## Evidence gathered from outside

- Every failed run reached "Commit and push if changed" with a **real payload**
  (`2 files changed` — package.json + pnpm-lock.yaml), then died on:
  `remote: error: GH006: Protected branch update failed for refs/heads/main` /
  `2 of 2 required status checks are expected`.
- The retry loop (`push → fetch → rebase → push`, 3 attempts) rebased onto an
  already-up-to-date main each time — the rejection was never a race, so the
  retries could not help.
- 2026-08-04 01:42, `dd3e730a` — `feat(ci): give this repo a pull-request
check, which it never had (#29)` — is when main gained required status
  checks. The bot pushed with the default `GITHUB_TOKEN`, which cannot bypass
  them. Sample failed run: 30956523215.
- 2026-08-04 22:32, `cf1c8131` — `fix(ci): let the auto-update bot push to a
protected main` — set `token: ${{ secrets.HADOKU_SITE_TOKEN }}` on checkout
  in `update-wolffm.yml` (PAT + `enforce_admins=false` ⇒ bypass). The very next
  run (30956831878, 22:33) committed and pushed a real update, so the recovery
  is not a no-op.

## Root-cause hypothesis

Required checks were added to main without updating the one workflow that
pushes to main directly. The failure only fires on a **non-empty payload**, so
it stayed invisible until a publish storm supplied ten payloads in a row.

## Your task

1. **Verify independently.** Confirm from this repo's own state: the branch
   protection config (which checks are required, `enforce_admins`), that
   `update-wolffm.yml` now checks out with `HADOKU_SITE_TOKEN`, and that the
   first post-fix run genuinely pushed (commit `4f05177e` on main).
2. **Then fix what verification confirms.** Candidates found from outside:
   - **Silent-failure window**: ten consecutive red runs made no noise until
     the next daily digest. Decide whether this workflow failing should alert
     (the ecosystem posts job outcomes to `/health/api/jobs` elsewhere — see
     tenhands' `taskauto.yml` for the pattern).
   - **Retry loop treats every rejection as a race**: a GH006 protection
     rejection is deterministic, but the loop burns three rebase-retries on it
     and the log buries the real error. Distinguish "non-fast-forward" (retry)
     from "protected branch hook declined" (fail fast with a pointed message).
   - Confirm required checks actually run on the bot's PAT-pushed commits
     (PAT-pushed commits do trigger workflows, unlike `GITHUB_TOKEN` pushes —
     verify the checks went green on `4f05177e` and later bot commits).

If your investigation contradicts anything above, trust your evidence, not
this document — and correct this file so the record is right.
