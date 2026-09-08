# Scenario Reports — Local Regression Suite (Issue #377)

The scenario suite freezes complete **synthetic** inputs as committed JSON, replays
them through the existing engine entry points, and compares the resulting pipeline
stages against baselines that were captured **once** at a recorded engine revision.
It answers one question: *"did anything change the numbers without us intending it?"*

It does **not** answer *"are the numbers legally correct?"* — that is the job of the
external golden layer in [`docs/validation.md`](validation.md).

## Provenance and its limits

Every captured value is an **INTERNAL REGRESSION** anchor:

- It proves *reproducibility against the recorded revision* — nothing else.
- The `external-golden-anchored` provenance class additionally checks the named
  stage paths against constants imported from `src/test/externalGoldenFixtures.ts`.
  Those anchors prove **only the named stages** — e.g. the §3 Nr. 63 cap case pins
  `funding.headroom.bav.capAnnual` to the fixture value 8 112 EUR. They do not
  upgrade the whole case, the family, or the engine to "validated".
- Stages the engine does not expose are declared per case in the report
  ("Nicht erfasst") instead of being pinned through invented decompositions.
- Monte-Carlo coverage is **terminal-only**: intermediate yearly bands are
  explicitly not covered; a drift confined to intermediate years that exactly
  cancels by retirement would not be detected.

## Files

| Path | Role |
|------|------|
| `src/test/scenarioReports/inputs/<family>.json` | Frozen synthetic inputs (14 families / 26 cases). Generated once by `npm run scenario:inputs`; routine tests never call `defaultScenario`. |
| `src/test/scenarioReports/baselines/family-<family>.json` | Frozen expected stage values per case, captured ONCE at the recorded revision. |
| `src/test/scenarioReports/baselines/provenance.json` | Capture identity: base SHA, engine-source digest, complete rules identity (`RuleSetIdentity` + canonical snapshot sha + year rules **and** evaluated cohort schedules), capture reason. |
| `src/test/scenarioReports/suite.ts` | Registry (case metadata + purposes), runner, diff engine, provenance gate. |
| `src/test/scenarioReports/stages.ts` | Stage extraction per entry point + explicit unsupported-stage declarations. |
| `src/test/scenarioReports/rulesFingerprint.ts` | Evaluated cohort schedules: freezes every cross-year cohort function's outputs over its legal span so formula changes cannot hide behind a JSON dump. Cross-year *data* is covered by the `legalRuleData` catalog via `ruleSetIdentity` (src/rules/ruleMetadata.ts). |
| `src/test/scenarioReports/report.ts` | Report assembly + Markdown emitter (pure). |
| `scripts/scenario-{capture-inputs,report,update-baseline}.ts`, `scripts/scenarioGitState.ts` | CLI wrappers (vite-node): input generation, report writing, baseline capture, engine identity. |
| `src/test/scenarioReports/scenarioSuite.test.ts` | The `npm test` / `npm run verify` hook: full replay fails on any unexpected divergence. |
| `src/test/scenarioReports/scenarioSuite.guard.test.ts` | Detection proofs: injected errors, missing-vs-null, non-finite rejection, input/baseline rejection. |
| `artifacts/scenario-report.{json,md}` | Generated report (gitignored, uploaded by CI). |

## Commands

```bash
npm run scenario:report            # run the suite, write artifacts/, exit 1 on drift
npm run scenario:inputs            # regenerate the frozen input JSON (after adding a family)
npm run scenario:update -- --reason "<why the new output is correct>"
npm run scenario:capture -- --reason "..."   # inputs + baselines in one step
npm test                           # includes the suite as a vitest file
```

The suite adds ~2 s to `npm test` (26 cases, ~5 700 stages; Monte Carlo is seeded
and limited to 200 runs).

## Baseline updates are deliberate

`npm run scenario:report` never rewrites anything. Divergence fails with the first
divergent stage (pipeline order: funding → statutory baseline → salary phase →
accumulation → gross payout → tax → KV/PV → net), the exact path, expected/actual,
and the tolerance. Only `scenario:update` writes baselines, and it **requires
`--reason`**, which is recorded in `provenance.json`. A passing report is never
treated as legal proof.

Tolerance: `1e-6` absolute for numeric stages — IEEE-754 reassociation headroom
only, not a licence for visible drift. Booleans and `null` compare exactly.
Non-finite values (NaN/±Infinity) never compare equal, and a deleted stage fails
even when its baseline value was `null` (missing ≠ explicit null).

## Clean-source capture workflow

A baseline must be attributable to a committed engine. `scenario:update` therefore
refuses to run when the calculation sources (`src/engine`, `src/rules`,
`src/domain`, `src/app`, `src/utils`, `src/data`) differ from the committed state,
and prints the exact diff. The documented escape hatch

```bash
npm run scenario:update -- --reason "..." --allow-dirty-reason "why this is safe"
```

records the dirty paths, the engine-source digest, and the reason verbatim in
`provenance.json`. Every report stamps **both** engine identities — the baseline's
capture state and the evaluated state (HEAD + source digest + dirty paths) — so a
run against a locally patched engine can never masquerade as a verdict on a
committed revision.

## Rules identity: rule-year change vs model change

`provenance.json` freezes the complete rules identity, reusing the central rule
metadata (`src/rules/ruleMetadata.ts`):

- `ruleSet` — the compact `RuleSetIdentity` stamp:
  `ruleSetIdentity(rules, legalRuleData, activeRulesMetadata)` → `ruleSetId`,
  `ruleYear`, `revision`, and a `contentFingerprint` over the year rules AND the
  `legalRuleData` catalog (every exported non-function datum of
  `legalConstants.ts`);
- `snapshotSha` — sha256-16 prefix of
  `canonicalRuleSetSnapshot(rules, legalRuleData)`;
- `activeRules` — the full year file (`src/rules/de2026.ts` today, via
  `src/rules/index.ts`) as the replayable snapshot proper; and
- `cohortSchedules` — the evaluated cohort functions (§22 Besteuerungsanteil,
  §19 Abs. 2 Versorgungsfreibetrag, §22 Ertragsanteil, Halbeinkünfte minimum
  ages) over their full legal spans. Functions do not survive JSON, so their
  evaluated outputs are frozen instead; the engine-source digest additionally
  pins the literal implementation.

The gate is three-valued: `match`, `drift`, or `missing`. Missing provenance is a
failing gate — it never counts as a clean run.

**Workflow on a rules change (law change / annual update):** land the rules change
first, confirm the external golden tests against their (independently sourced)
fixtures, then re-capture with
`npm run scenario:update -- --reason "Annual de2027 rate update"` in the same PR.
The report will show the rules drift until the baselines are re-captured — that is
intended: stage deltas under rules drift mix rule changes with model changes and
cannot be reviewed as regression.

**Workflow on a model change (engine refactor or behaviour change):** if the change
is intended, the failing paths in `artifacts/scenario-report.md` are the review
checklist; update the baseline in the same PR with a reason naming the issue.
If the change is NOT intended, the failing paths are the bug report.

## CI

`.github/workflows/scenario-report.yml` runs `npm run scenario:report` and uploads
`artifacts/` with `if: always()`, so a red run still ships its diagnostic report.
The suite also runs as part of `npm test` inside `npm run verify`.

## Adding a scenario family

1. Add builders + a family function in `src/test/scenarioReports/inputs/buildInputs.ts`.
2. Add case metadata (id, purpose, provenance class, optional anchor) to `CASE_META`
   in `suite.ts`.
3. `npm run scenario:inputs`, then capture baselines on a clean tree with a reason.
4. Document what the family pins in the case `purpose` — that text is what the
   report shows reviewers.
