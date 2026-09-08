# Rules versioning — annual updates, algorithm changes, and provenance metadata

How the rule sets in `src/rules/` are versioned, how to roll the rule year,
what counts as an algorithm change, and what the provenance metadata does —
and explicitly does not — promise. Consumed by the upcoming scenario runner
and any UI that needs to say which rules produced a number.

Scope note (#376): this issue finished centralizing the §32a EStG income-tax
tariff coefficients (`de2026.ts` → `incomeTax.tariff`) and the soli formula
constants (`legalConstants.ts` → `soli`). `src/engine/tax.ts` now holds no
tariff or soli literals; the formula and statutory floor are unchanged and all
active-2026 results are byte-identical (3934 tests, external goldens green).

## What is centralized where

| Kind | Home | Examples | Change cadence |
|------|------|----------|----------------|
| Year-specific statutory values | `src/rules/de2026.ts` | Tariff zones + coefficients, Grundfreibetrag, Soli-Freigrenze, BBG, Rentenwert, Basiszins | Once a year (plus mid-year announcements like the Basiszins) |
| Cross-year statutory constants | `src/rules/legalConstants.ts` | Soli rate 5.5 %, Milderungszone 11.9 %, 1/120 spreading, Fünftelregelung divisor, cohort tables | Only on law amendment |
| Active-set swap point | `src/rules/index.ts` | `activeRules` re-export, `activeRulesMetadata`, `rulesMetadataById` | One line per year flip |
| Algorithm identity | `src/rules/ruleMetadata.ts` | `TAX_CALCULATION_MODEL`, replay/projection caveats | Only when the implemented formula changes |

The engine reads all of these — `src/engine/**` must contain no statutory
literals (a P0 review bar). The tariff coefficients sit in the *year* file
rather than `legalConstants.ts` because §32a Abs. 1 Satz 2 coefficients are
re-issued together with the zone boundaries every assessment period.

## Provenance metadata contract

`src/rules/ruleMetadata.ts` defines the shapes; the year file carries its own
instance (`de2026RulesMetadata`), so provenance is updated in the same commit
as the values it describes.

- `RuleSetMetadata` — `ruleSetId` (`'de2026'`), `ruleYear`, `calculationModel`,
  per-area `RuleAreaProvenance[]`, `projectionAssumption`, `replayLimitations`.
- `RuleAreaProvenance` — dotted key into the rule inputs (`incomeTax.tariff`,
  `soli`, …), statute citation, source (capture date / URL), optional
  `effectiveFrom` (ISO date), and how the area is pinned
  (`external-golden` | `statutory-pin` | `inline-citation`).
- `CalculationModelVersion` — stable `id` plus integer `version` of the
  implemented formula, independent of the coefficients fed into it.

Consumers:

- **Scenario runner** — stamp every stored result with
  `{ ruleSetId, ruleYear, calculationModel: { id, version } }` taken from
  `activeRulesMetadata`. To judge a stored result later, call
  `rulesMetadataById(ruleSetId)`: a non-null return means *this build speaks
  for that rule set*; `null` means the result was produced under a different
  or retired rule set and must be surfaced as such, never silently recomputed.
- **UI** — the same metadata can back a "Rechtsstand / Berechnungsmodell"
  line. Quote `areas[].source` verbatim; do not reword citations into claims
  of fresh verification.

## Rule year vs. projection assumption

`ruleYear` is the calendar year whose statutory values are compiled in. The
projection horizon runs decades past it (retirement ages land in the 2060s),
and the engine carries the active rule set forward unchanged. That is a
documented holding assumption — `PROJECTION_ASSUMPTION` in
`ruleMetadata.ts`, carried on every rule set's metadata. Results for years
past the rule year must never be presented as year-specific legislation.

## Annual update workflow (de2026 → de2027)

1. **Collect external captures first.** Before writing values, record golden
   captures from the official calculators for the new year into
   `src/test/externalGoldenFixtures.ts` (see `docs/validation.md` for the
   source map and tolerance policy). No value ships without a pin.
2. **Copy the year file.** `cp src/rules/de2026.ts src/rules/de2027.ts`; update
   changed values **and** the `de2027RulesMetadata` block at the bottom:
   `ruleSetId`, `ruleYear`, `effectiveFrom` per area, and the `source` strings
   pointing at the new captures.
3. **Flip the swap point.** In `src/rules/index.ts`, import `de2027` instead of
   `de2026` and re-export it as `activeRules`. `RULES_YEAR` and
   `activeRulesMetadata` follow automatically; the drift tripwire in
   `src/rules/ruleMetadata.test.ts` fails if the metadata was not carried.
4. **Keep the old year file** if historical replay is wanted. A retired year
   file is acceptable — `rulesMetadataById` then returns `null` for it and
   consumers must show "produced under different rules".
5. **Run `npm run verify`.** Oracle/snapshot goldens that pin the previous
   year's outputs will fail; update them only because the *rule year* changed,
   and only per the oracle-snapshot guardrail in `CLAUDE.md` (the issue body
   must justify it).

## Algorithm-change workflow

An *algorithm change* is anything in the implemented formula beyond new
coefficients: zone restructuring, a new rounding step, a different soli shape,
a new zone. Then:

1. Bump `TAX_CALCULATION_MODEL.version` (+1) and update its `summary` in
   `src/rules/ruleMetadata.ts`. Do **not** bump it for annual coefficient
   updates — those are rule-set data.
2. Re-pin the behavior with external goldens that exercise the new shape
   before merging.
3. Stored results keep the model version they were produced under; the runner
   compares versions instead of silently recomputing. Engine rounding policy
   does not change as part of an algorithm change (display rounding stays at
   the UI boundary).

## What the metadata does not do

An ID is not a time machine. `REPLAY_LIMITATIONS` (carried on every rule set)
says this explicitly; the short form:

- A `ruleSetId` identifies the producing rule set. It reproduces results only
  while that year file is compiled into the bundle.
- Replaying another rule year requires that year file with verified values and
  its own external captures — not just the ID.
- Cross-year cohort tables (`besteuerungsanteilGrv`, `versorgungsfreibetrag`,
  `ertragsanteilByAge`) are parametrised over retirement years inside one rule
  set; they are not year rule files.
- Model-version changes never retroactively rewrite stored results.

## Verification posture

Citations in `de2026.ts`, `legalConstants.ts`, and the metadata are
bookkeeping: they record where values *came from* as this repo cites them.
They are not statements of freshly verified legislation, and contributors must
not present them as such. The binding verification is the golden suite —
`incomeTax2026GoldenCases`, `bmfEinkommensteuerRechner2026GoldenCases`,
`capitalGains2026GoldenValues` and friends in
`src/test/externalGoldenFixtures.ts`, captured by hand from official
calculators. If a golden and a citation disagree, the golden wins until a
human re-verifies against the primary source. The tariff-parameterization
tests in `src/engine/tax.test.ts` additionally prove the engine really
consumes the injected values: every coefficient perturbation measurably
changes the output and breaks at least one official capture.

## Remaining statutory-literal inventory (identified, not fixed here)

Focused scan of `src/engine/**` non-test code after #376. None of these block
anything; each is a small follow-up when its area is next touched.

| Location | Literal | Statutory meaning | Suggested home |
|----------|---------|-------------------|----------------|
| `src/engine/salary.ts` (`calculateVorsorgepauschale2026`) | `1_900` | §39b EStG PAP: the AV Teilbetrag counts only while KV + PV + AV ≤ 1 900 EUR (as described in `TAX_SOCIAL_SECURITY_2026_RESEARCH.md` §2) | `GermanRules.socialSecurity` (annual-capped value) |
| `src/engine/bavWarnings.ts` (`computeBavMinimumEntitlement`) | `160` | §1a Abs. 1 S. 1 BetrAVG: minimum conversion = 1/160 of annual Bezugsgröße West | `legalConstants` (cross-year divisor) |

Not items: `capitalGains.solidarityRate` is aliased to
`legalConstants.soli.rate` (one 5.5 % definition, #376); comment-only value
mentions (e.g. `riester.ts` "4 % / 2 100") restate `src/rules/` values for
readers and are fine.
