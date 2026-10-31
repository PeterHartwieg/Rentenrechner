PRs now keep the required `verify` check while selecting work from the diff. Full verification runs on every production-bound main push, twice daily with a SHA skip guard, and by dispatch on main. This PR automatically escalates to full because it changes workflow definitions and `package.json`; no manual `full-ci` override is needed.

- `npm run verify:focused` defaults to `origin/main`; Actions supplies the PR base SHA. It selects changed-code ESLint, `tsc -b`, related Vitest tests and changed tests, route coverage, affected Workers, and build/dist checks. Doc-only diffs skip these checks. Production dependency auditing stays blocking on every PR; the informational full audit runs only with full verification.
- Full escalation covers the `full-ci` label, >40 files, manifests/locks, tsconfig, Vite/Vitest/ESLint config, test setup, shared test fixtures, rules, domain types, and workflows. Reasons appear in the job summary. Label/unlabel events rerun verification. Exact-head dispatch retains all existing inputs and adds `suite: focused|full`, default full. Explain any manually applied `full-ci` label in the PR body.
- Main's workflow serializes runs per ref without cancelling an in-progress run. At 11:17 / 23:17 UTC (20:17 / 08:17 JST), its small gate queries this workflow's successful runs for the current main SHA, regardless of event, and skips unchanged code. Push and dispatch always run. The weekly property/mutation workflow retains its jobs, contents and concurrency; its scheduled gate compares the last successful scheduled SHA, while dispatch always runs.
- Delete `scenario-report.yml` and generate/upload its artifact inside main full verification instead. This removes the duplicate PR/main workflow. Push artifact generation is limited to calculation-source directories (`engine`, `rules`, `domain`, `app`, `utils`, `data`), scenario inputs/fixtures/scripts, manifests/locks, and its workflow. These include the imports of `suite.ts` / `stages.ts` and the source-digest directories in `scenarioGitState.ts`. Schedule/dispatch generate reports whenever the full job runs, including diagnostic artifacts after verification failures.
- Main full failures create an assigned `[ci-red] main full verify failed` issue, or comment on an existing open `ci-red` issue; later green runs comment and close alerts. Reports include SHA, run URL and failed steps. Only the main notification jobs have `issues: write`; they execute inline trusted workflow code without checking out PR code. The owner bot **Rentenrechner** picks these up via a routine listener on this repository, set up outside this PR.
- Update AGENTS.md, CLAUDE.md and README with the standing CI working mode. Fork PRs still use `pull_request`, read-only permissions and no secrets. No workflow path filter can suppress the required `verify` check.

Validation (2026-10-31):

- `npm ci`: passed (16 moderate advisories; no dependency changes in this PR).
- `npm audit --omit=dev --audit-level=high`: passed, zero production vulnerabilities.
- `npm run verify`: passed via the synthetic rules escalation, including lint, 292 test files (5,612 passed, 1 skipped), 112 route tests with 99.01% branch coverage, both Worker typechecks and test suites (27 + 16 tests), OG generation, production build, prerender, and dist checks (16 sitemap pages + 404 + app shell).
- Focused-selection and workflow regression tests: 45 passed. Includes Vitest 4 CLI parsing, escalation boundaries, affected workers/build/routes, fork safety, and mocked alert creation/deduplication/recovery.
- Both guard shell scripts executed with mocked `gh`: 11 cases passed, including unchanged/new/missing previous SHA, push/dispatch, and API errors failing closed.
- Actionlint 1.7.12: all workflows passed. `git diff --check`: passed.
- `tsc -b --extendedDiagnostics`: 17.68 seconds locally, retained in focused mode (well below two minutes).
- A fourth synthetic diff under `workers/qa-submit/src/index.ts` passed changed-file lint, root typecheck, and only that Worker's typecheck/tests (27 tests). It also exercises shell-free npm invocation on Windows.
- An initial full run caught two existing workflow assertions that assumed main pushes lived in `pr-verify`; those assertions now cover the split workflows. No application behavior or snapshots were intentionally changed.

Synthetic diffs were created with a temporary Git index and unreferenced `git commit-tree` children of `87a799e`. Each changes one existing file by a newline; no branch was created or switched, and the worktree's application/rules files were untouched. `--head` permits exercising the real Git diff selector against these objects; all selected commands actually ran (not dry-run plans).

```text
npm run verify:focused -- --base 87a799e018b37c4074ff7950971b838067e782d0 --head 5453535929e5a7a2f1feedc0e2b98aedd19b7b77
### CI: focused
changed files: 1 (README.md)
- documentation-only or empty diff; nothing to run
exit 0

npm run verify:focused -- --base 87a799e018b37c4074ff7950971b838067e782d0 --head 0969159cab11d5ea0d7d90b60767736b4c511898
### CI: focused
changed files: 1 (src/engine/altersvorsorgedepot.ts)
- eslint --max-warnings=0 -- src/engine/altersvorsorgedepot.ts
- tsc -b
- vitest related --run --passWithNoTests src/engine/altersvorsorgedepot.ts
Test Files 166 passed (166)
Tests 3515 passed | 1 skipped (3516)
Duration 101.31s (Vitest)
exit 0

npm run verify:focused -- --base 87a799e018b37c4074ff7950971b838067e782d0 --head 7725925110846194ede0290dadca19591237b0af
### CI: full
changed files: 1
- high-risk inputs: src/rules/de2026.ts
- npm run verify
Test Files 292 passed (292)
Tests 5612 passed | 1 skipped (5613)
Route tests: 112 passed; branch coverage 99.01%
Worker tests: 27 + 16 passed; both typechecks passed
[check-dist] 16 sitemap pages + 404 and app shell passed
exit 0
```

The engine example reaches many tests because the calculator is widely imported, including scenario/property suites. This is still dependency-related selection. A parser regression test ensures Vitest actually receives the filenames: inserting `--` before its filenames silently produces an empty related-test selection in Vitest 4.

Current-branch selector demonstration after implementation commit `ce02636`:

```text
npm run verify:focused -- --plan
### CI: full
Base: origin/main; head: HEAD; changed files: 12
- high-risk inputs: .github/workflows/main-verify.yml, .github/workflows/pr-verify.yml, .github/workflows/property-sweep.yml, .github/workflows/scenario-report.yml, package.json
- npm run verify
```

Remote verification is pending the harness push/PR creation. The required `verify` job will enter via `verify:focused` and report full escalation for this PR's workflows and manifest. No remote green check is claimed by local validation.

CI cost estimate (rule 10; illustrative volume, not observed history):

| Work | Before: runs/month x minutes | After: runs/month x minutes |
|---|---:|---:|
| PR checks (120 updates; 10% need full) | 120 x 6 = 720 | 108 x 2 + 12 x 6 = 288 |
| Main full verification (30 merges) | 30 x 6 = 180 | 30 x 6 = 180 |
| Separate scenario reporting / integrated reporting (50% relevant main pushes) | 150 x 1 = 150 | 15 x 1 = 15 |
| Main gate and green resolution jobs | 0 | 30 x 2 x 1 = 60 |
| Twice-daily schedules, normally already green from push | 0 | 61 x 1 = 61 |
| Weekly property/mutation (conservative: every week has changes) | 4.3 x 10 = 43 | 4.3 x 11 = 47.3 |
| Total | **1,093 min/month** | **651.3 min/month (~40% less)** |

Assumptions include install/setup in the check durations and one minute per lightweight job. Failed notifications and manual dispatches add occasional runs. If a scheduled SHA lacks a green push run, add ~7 minutes for that full run plus resolution. Quiet weeks also skip the property/mutation work. This repository is public, so hosted Actions minutes are free; the policy still reduces redundant work.

Offline `ci-cost-lint` was run against copies of every resulting workflow under `<temp>/PeterHartwieg/Rentenrechner/`:

```text
bin/ci-cost-lint run --offline-dir <temp> --repos PeterHartwieg/Rentenrechner \
  --state-dir <temp>/state --out <temp>/cost-report --dry-run --fail-on never
```

Result table (no CC10 or CC12 findings in any workflow):

| repo | workflow | rule | severity | detail | est min/month | pool |
|---|---|---|---|---|---|---|
| internal-repos-list | * | CC0 | error | /home/box/shared/coding-team/tooling/ci-internal-repos.md: unreadable (FileNotFoundError) | 0 |  |
| PeterHartwieg/Rentenrechner | main-verify.yml | CC1 | violation | no concurrency with cancel-in-progress: true (jobs without: gate, full, ci-red, resolve-ci-red) | 2416 D | personal-hosted |
| PeterHartwieg/Rentenrechner | main-verify.yml | CC2 | warning | no paths/paths-ignore on: push | 2416 D | personal-hosted |
| PeterHartwieg/Rentenrechner | main-verify.yml | CC7 | warning | never references vars.CI_THROTTLE (4 jobs, schedule) | 2416 D | personal-hosted |
| PeterHartwieg/Rentenrechner | main-verify.yml | CC8 | warning | no timeout-minutes, a hung job burns 360 min (jobs: full, ci-red, resolve-ci-red) | 2416 D | personal-hosted |
| PeterHartwieg/Rentenrechner | pr-verify.yml | CC2 | warning | no paths/paths-ignore on: pull_request | 200 | personal-hosted |
| PeterHartwieg/Rentenrechner | pr-verify.yml | CC8 | warning | no timeout-minutes, a hung job burns 360 min (jobs: verify) | 200 | personal-hosted |
| PeterHartwieg/Rentenrechner | property-sweep.yml | CC7 | warning | never references vars.CI_THROTTLE (3 jobs, schedule) | 64.5 | personal-hosted |
| PeterHartwieg/Rentenrechner | main-verify.yml | CC3 | info | 17 23 * * *; 17 11 * * *: 60.8 runs/month, 2/day, every 720 min at the shortest | 2416 D | personal-hosted |
| PeterHartwieg/Rentenrechner | property-sweep.yml | CC3 | info | 37 4 * * 1: 4.3 runs/month, 1/day, every 10080 min at the shortest | 64.5 | personal-hosted |
| PeterHartwieg/Rentenrechner | main-verify.yml | EST | info | observed_30d=0 modelled=2416; runs/mo 120.8 = cron 60.8 + push 60x1 + PR 40x0 (defaults); min/run 20 (default); scheduled runs skipped with no new merge cost about 1 min (gate job); model assumes full runs | 2416 D | personal-hosted |
| PeterHartwieg/Rentenrechner | pr-verify.yml | EST | info | observed_30d=0 modelled=200; runs/mo 40 = cron 0 + push 60x0 + PR 40x1 (defaults); min/run 5 (default) | 200 | personal-hosted |
| PeterHartwieg/Rentenrechner | property-sweep.yml | EST | info | observed_30d=0 modelled=64.5; runs/mo 4.3 = cron 4.3 + push 60x0 + PR 40x0 (defaults); min/run 15 (default); scheduled runs skipped with no new merge cost about 1 min (gate job); model assumes full runs | 64.5 | personal-hosted |

The tool's coarse default model rises from 1,043 to 2,680.5 minutes/month: it assigns five minutes to every gate/notification job and assumes all 60.8 schedules run fully. It explicitly notes that skipped schedules cost about one gate minute, but cannot infer actual skipped frequency offline. The separate estimate above makes volume/duration/skip assumptions explicit. `D` is its private personal-pool quota marker; this public repository does not consume that billed pool. CC0 is a local tool-configuration limitation, not malformed workflow YAML. CC1 is the explicit main serialization requirement. CC2 is deliberate: every required PR check and production main push must run. CC7 adds no new throttle behavior; CC8 leaves long foreground verification unrestricted. Existing property job timeouts are retained; both new gate jobs have the required five-minute timeout.

Manual follow-ups (outside this PR; not performed):

- Branch protection: none expected, because required check `verify` is unchanged. No protection changes were made.
- Cloudflare Workers Builds: consider changing the production build command to `npm run verify` so deployment itself waits for the full suite. Today it deploys independently of Actions; this PR's pre-deploy full run does not enforce that wait. No Workers Builds settings were changed.
- Harness `task.yaml` defaults: the owner bot updates `runs/_template` after merge; no harness changes here.
- Create the repository label `full-ci` if missing. PR workflows intentionally have no label-write permission or additional token.
- Owner bot: ensure the routine listener on this repository consumes `ci-red` issues, and rerun offline cost lint where the configured internal-repository list is available. Retain/document the requested main concurrency exception.
