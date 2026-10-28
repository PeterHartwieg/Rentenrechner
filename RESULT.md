# rente-420 handoff

Status: **partial** — implementation complete; the full verification gate is not green on this Windows machine because of existing automation/review-tooling incompatibilities. Application tests, lint, typechecks, Worker tests, and production build pass.

Branch: `codex/issue-420-deferred-findings`

PR URL: https://github.com/PeterHartwieg/Rentenrechner/pull/434 (DRAFT)

## Changes and evidence

| Finding | Before / after and verification |
| --- | --- |
| Kapital scenario sync | Local Kapital and Vergleich selections could diverge from the app/print selection. Both now use the app selection; incoming query and picker choices sync back. Kapital component tests cover both modes; App route regression checks return to Vergleich and its print report. |
| Rendite label | Bare percentages on Kapital now have a visible `Rendite-Annahme` heading, asserted in the rendered test. |
| Scenario resolvers | Removed Kapital's duplicate resolver. Shared resolver prefers requested ID, then basis, then first available, then the empty-set basis sentinel; tests cover custom-only/empty sets and default ordering. This changes display selection, not financial calculations. |
| Drawdown-horizon chip | `/kapital` changed to `/eingaben#renteneintritt`; rendered navigation assertion updated. |
| Legacy EP comment | Previously claimed no visible number could be affected; now specifically describes pension projection and acknowledges the DRV card's stored points. Display behavior unchanged. |
| Onboarding status | Replaced `Object.assign` with propagation of the helper's complete map, preserving deleted keys. Test covers switching manual gross to points, other statuses, and input immutability. |
| Inflation hint | Hardcoded `2 %` replaced by formatting `DEFAULT_EXPERT_INFLATION_RATE`; rendered assertion added. |
| Validation docs | Orientation sentence now correctly attributed to the right rail of `AngabenPage.tsx`. |
| Indirect eligibility constants | Separate Riester/AVD constants retain existing 60/120 annual values. Tests pin values and verify independence from allowance minima. No current financial outputs changed. |
| Riester panel eligibility | Panel consumes `RiesterFundingResult.section10aEligible` from the funding calculation instead of re-deriving with activeRules. Alternate-rule rendered regression added; fixtures updated. |
| Basisrente copy | “Erwartete Rendite … nach Kosten” changed to “Erwartete Marktrendite vor Kosten”, with separate fee deduction explained. |
| Contract return wording | Recommender, Methode, and print use “eigene Marktrendite”; corresponding existing tests updated. CandidateReturnNote consumes the shared label. |
| Missing rendered captions | Added solver test for target + another own return, and saved-confirmation tests for that case and another-contract-only case. |

The informational solved-state `Szenario und Horizont` row remains concise; its preceding caption already names the target rate and scenario. No product decision was inferred from this informational note.

Rules provenance was refreshed after committing calculation sources. All numeric baseline files remain unchanged: the capture produced two approximately 1e-11 Monte Carlo differences on this platform, which were discarded rather than accepted as new expectations. Scenario replay passes against the original numeric fixtures.

## Commands and results

- `gh issue view 420 --comments` and JSON body/comments: read both issue body and follow-up findings.
- `npm ci`: PASS (616 packages installed; transient tarball retries recovered). npm reported 21 dependency advisories; dependency updates are outside this task.
- Focused `npx vitest run` across 10 affected test files: PASS, 321 tests.
- `npx tsc -b`: PASS.
- `npm run verify`: lint passed; test phase failed, so subsequent stages were run explicitly. Initial test run: 286 files passed / 11 failed; 5518 tests passed / 58 failed / 1 skipped. This included stale rule provenance and two async route waits, resolved/verified in subsequent runs, plus unrelated Windows tooling failures.
- `npm run scenario:update -- --reason "Refs #420: separate existing indirect eligibility minima without changing financial outputs; refresh rules identity"`: PASS after restoring test-generated line-ending-only snapshot rewrites. First attempt correctly refused the dirty snapshot paths. Captured 5872 stage values across 14 families; only provenance retained.
- `npx vitest run src --maxWorkers=2`: PASS, 275 files; 5187 tests passed, 1 skipped. Includes scenario replay and all application regressions.
- `npm run worker:typecheck`: PASS for both Workers.
- `npm run worker:test`: PASS, QA Worker 26 tests and Simulate Worker 11 tests.
- `npm run build`: PASS, including `tsc -b`, Vite build, and prerender. Generated unrelated OG binary changes discarded.
- Final `npm run lint`: PASS.
- Final `npm test -- --maxWorkers=2`: FAIL only in seven unchanged automation/review-tooling suites. 290 files passed / 7 failed; 5523 tests passed / 53 failed / 1 skipped. No application test failures remain. Failed files: `scripts/automation/pr-verify-scope.test.mjs`; `scripts/review/{cli,codexSession,contextGuard,orchestrate,panels,runner}.test.mjs`.
- `git diff --check`: PASS.

Ignored validation logs remain in the worktree (`verify.log`, `tests-final.log`, `src-tests.log`, `targeted-tests.log`, `typecheck.log`, `worker-typecheck.log`, `worker-tests.log`, `build.log`, `lint-final.log`, `scenario-update.log`).

## Windows verification limitations

Unchanged tooling tests under `scripts/review/` require symlink privileges or assume POSIX paths/executable conventions. Failures include EPERM on symlink creation, fixture paths resolved as `C:\C:\...`, slash-specific mocked directory trees and binary-location expectations, plus a review CLI suite import SyntaxError. `scripts/automation/pr-verify-scope.test.mjs` uses exact line comparisons that fail with this checkout's CRLF workflow files. These tests were not weakened, edited, or skipped in the full test commands.

## Open questions — behavior intentionally unchanged

1. Joint-assessment workstream: how should the indirect spouse's deduction use the directly eligible spouse's joint return and distinct cap, instead of the current single-saver approximation?
2. Combine-mode allocation: should household §10a benefit allocation continue by contribution share or account for eligibility per contract? Existing behavior preserved.
3. AVD legal verification: confirm the existing indirect-eligibility minimum against final legislation alongside the other AVD constants. This task separates the constant without reinterpreting or changing its amount.

## Suggested next steps

Review the draft PR and run the full verification gate in Linux CI. Address Windows portability of the review/automation tests separately if local Windows full-suite support is required. Resolve financial/product questions in their own workstreams. Do not merge until normal review and CI requirements are met.

No deployment, merge, release, or issue closure performed. RESULT.md is deliberately uncommitted.


Commits pushed only to the assigned branch:

- `271a653` preserve scenario selection across capital/comparison pages
- `aaf9aea` clarify return assumptions and preserve pension input status
- `00fa2a5` separate indirect eligibility rules from allowance minima
- `e922d9b` refresh rule provenance and stabilize lazy route regression

`git push -u origin codex/issue-420-deferred-findings`: PASS.
`gh pr create --draft --base main --head codex/issue-420-deferred-findings --body-file .pr-body-420.md`: PASS; draft #434 uses Refs #420.
