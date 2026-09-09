# Rules versioning — annual updates, algorithm changes, and provenance metadata

How the rule sets in `src/rules/` are versioned, how to roll the rule year,
what counts as an algorithm change, and what the provenance metadata does —
and explicitly does not — promise. Consumed by the upcoming scenario runner
and any UI that needs to say which rules produced a number.

Scope note (#376): this issue finished centralizing the §32a EStG income-tax
tariff coefficients (`de2026.ts` → `incomeTax.tariff`), the soli formula
constants (`legalConstants.ts` → `soli`), the §39b EStG PAP KV+PV+AV cap
(`legalConstants.ts` → `payrollTax.vorsorgepauschaleKvPvAvCap`, 1 900), and
the §1a Abs. 1 S. 1 BetrAVG divisor (`legalConstants.ts` →
`bav.minimumEntitlementDivisor`, 160). `src/engine/tax.ts` now holds no tariff
or soli literals; the formulas and statutory floors are unchanged and all
active-2026 results are byte-identical (external goldens green).

## What is centralized where

| Kind | Home | Examples | Change cadence |
|------|------|----------|----------------|
| Year-specific statutory values | `src/rules/de2026.ts` | Tariff zones + coefficients, Grundfreibetrag, Soli-Freigrenze, BBG, Rentenwert, Basiszins | Once a year (plus mid-year announcements like the Basiszins) |
| Cross-year statutory constants | `src/rules/legalConstants.ts` | Soli rate 5.5 %, Milderungszone 11.9 %, §39b KV+PV+AV cap 1 900, 1/160 BetrAVG divisor, 1/120 spreading, Fünftelregelung divisor, cohort tables | Only on law amendment |
| Active-set swap point | `src/rules/index.ts` | `activeRules` re-export, `activeRulesMetadata`, `activeRuleSetIdentity`, `rulesMetadataById` | One line per year flip |
| Algorithm identity | `src/rules/ruleMetadata.ts` | `TAX_CALCULATION_MODEL`, replay/projection caveats | Only when the implemented formula changes |

The engine reads all of these — `src/engine/**` must contain no statutory
literals (a P0 review bar). The tariff coefficients sit in the *year* file
rather than `legalConstants.ts` because §32a Abs. 1 Satz 2 coefficients are
re-issued together with the zone boundaries every assessment period. The two
payroll constants (`1 900` cap, `1/160` divisor) sit in `legalConstants.ts`
because they are fixed by statute, not re-issued annually.

## Provenance metadata contract

`src/rules/ruleMetadata.ts` defines the shapes; the year file carries its own
instance (`de2026RulesMetadata`), so provenance is updated in the same commit
as the values it describes.

- `RuleSetMetadata` — `ruleSetId` (`'de2026'`), `ruleYear`, `revision`
  (integer, bumped when the same year's values are amended after initial
  publication), `calculationModel`, `scope` (textual statement of which engine
  areas the provenance covers), per-area `RuleAreaProvenance[]`,
  `projectionAssumption`, `replayLimitations`.
- `RuleAreaProvenance` — dotted key into the rule inputs (`incomeTax.tariff`,
  `soli`, …), statute citation, source (capture date / URL), optional
  `effectiveFrom` (ISO date), and how the area is pinned
  (`external-golden` | `statutory-pin` | `inline-citation`).
- `CalculationModelVersion` — stable `id` plus integer `version` of the
  implemented formula, independent of the coefficients fed into it.
- `RuleSetIdentity` — `{ ruleSetId, ruleYear, revision, contentFingerprint }`
  via `ruleSetIdentity(rules, legalData, metadata)`. The fingerprint is a dual
  FNV-1a digest (domain-separated rounds) over
  `canonicalRuleSetSnapshot(rules, legalData)` — the year rules **and** the
  `legalRuleData` catalog, which enumerates EVERY exported non-function datum
  of `legalConstants.ts` (the `legalConstants` groups, the Werbungskosten- and
  Sonderausgaben-Pauschbeträge, the §20 InvStG Teilfreistellung, the childless
  PV-surcharge age). Serialization is recursive key-sorted, so the fingerprint
  is deterministic and independent of key insertion order, and it moves when
  EITHER input is amended (soli slope, §39b cap, §1a divisor, Pauschbeträge,
  Teilfreistellung — all included). An exhaustiveness test
  (`ruleMetadata.test.ts`, "rule-data catalog exhaustiveness") fails if a new
  `export const` appears in `legalConstants.ts` without a catalog entry, so
  "covers all exported rule data" cannot silently rot. It is a **change
  detector**, not a reproduction mechanism and not a collision-proof hash:
  equal fingerprints strongly suggest equal inputs, but you cannot reconstruct
  rule values from a fingerprint. The snapshot covers rule *data* only — the
  cross-year functions (`besteuerungsanteilGrv`, `versorgungsfreibetrag`,
  `ertragsanteilByAge`, `halbeinkuenfteMinAgeForContractStartYear`) are code,
  and their behavior is pinned only by the engine revision.

`de2026RulesMetadata.scope` is deliberately narrow: the provenance covers the
tax areas routed through `src/engine/tax.ts` (tariff, soli, capital gains)
plus their rule inputs. It is **not** a snapshot of the whole engine —
funding formulas, cohort algorithms, payout cascades, and rounding points
outside that file are not attested by this metadata. Areas are per field where
the golden coverage is per field: `capitalGains.basiszins` is
`external-golden` (the only capital-gains field with an external capture),
while `capitalGains.taxRate` / `saverAllowance` / `solidarityRate` are
`statutory-pin`.

Consumers:

- **Scenario runner** — stamp every stored result with the full
  `RuleSetIdentity` (`ruleSetId`, `ruleYear`, `revision`, `contentFingerprint`)
  plus `calculationModel: { id, version }`, all taken from
  `activeRulesMetadata` / `activeRuleSetIdentity`. For replayable captures the
  runner should additionally record the producing git SHA and
  `canonicalRuleSetSnapshot(activeRules, legalRuleData)` — the metadata alone
  does not carry the values. To judge a stored stamp later, pass the whole
  `RuleSetIdentity` to `rulesMetadataById(stamp)`: every field must match this
  build (ID, year, revision, and a fingerprint recomputed from the active
  rules + legalRuleData), and `null` on any mismatch means the result was
  produced under different rule content and must be surfaced as such, never
  silently recomputed.
- **UI** — the same metadata can back a "Rechtsstand / Berechnungsmodell"
  line. Quote `areas[].source` verbatim; do not reword citations into claims
  of fresh verification.

## Rule year vs. projection assumption

`ruleYear` is the calendar year whose statutory values are compiled in. The
projection horizon runs decades past it (retirement ages land in the 2060s),
and the engine carries the active rule set forward unchanged. `PROJECTION_ASSUMPTION`
in `ruleMetadata.ts` splits what that actually means into two kinds:

1. **Modeled enacted schedules.** Some future-year behavior is legislated and
   modeled explicitly — the §22 Nr. 1 Besteuerungsanteil and
   Versorgungsfreibetrag cohort tables run to 2058, the AVD product start year
   gates contract availability, and insurance age splits follow the contract
   year. Carrying the rule set forward does not flatten these; they are real
   enacted law, not extrapolation.
2. **Holding assumption.** For every year-specific value *without* an enacted
   schedule (BBG, Rentenwert, Freibeträge, tariff beyond the rule year), the
   engine holds the active year's value constant. That is a modeling choice,
   not a statement about future legislation — those values will change when
   the legislature changes them.

Results for years past the rule year must never be presented as year-specific
legislation of either kind.

## Annual update workflow (de2026 → de2027)

1. **Collect external captures first.** Before writing values, record golden
   captures from the official calculators for the new year into
   `src/test/externalGoldenFixtures.ts` (see `docs/validation.md` for the
   source map and tolerance policy). No value ships without a pin.
2. **Copy the year file.** `cp src/rules/de2026.ts src/rules/de2027.ts`; update
   changed values **and** the `de2027RulesMetadata` block at the bottom:
   `ruleSetId`, `ruleYear`, `revision` (start again at 1 for the new year),
   `effectiveFrom` per area, and the `source` strings pointing at the new
   captures.
3. **Flip the swap point.** In `src/rules/index.ts`, import `de2027` instead of
   `de2026` and re-export it as `activeRules`. `RULES_YEAR`,
   `activeRulesMetadata`, and `activeRuleSetIdentity` follow automatically; the
   drift tripwire in `src/rules/ruleMetadata.test.ts` fails if the metadata was
   not carried.
4. **Same-year amendment?** If values for the *current* year change after
   publication (a Nachtrag, a corrected Bekanntmachung, a mid-year Basiszins
   step), bump `revision` in that year file's metadata. The `ruleSetId` stays
   the same — it names the year, not the revision — so the revision field is
   the only way to distinguish the two value sets. The same rule applies to
   **cross-year amendments**: every exported rule datum in
   `legalConstants.ts` (groups and standalone exports alike) is part of the
   fingerprint via the `legalRuleData` catalog, so bump `revision` in the
   active year file's metadata in the same commit — `rulesMetadataById` then
   rejects every stamp from before the amendment instead of silently
   accepting it. Amendments to the cohort FUNCTIONS require a `revision` too
   (they change computed results) even though the functions themselves are
   not hashed — they are covered by the engine revision, not the snapshot.
5. **Keep the old year file** if historical replay is wanted. A retired year
   file is acceptable — `rulesMetadataById` then returns `null` for it and
   consumers must show "produced under different rules".
6. **Run `npm run verify`.** Oracle/snapshot goldens that pin the previous
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
3. Nothing in the application preserves outputs, so an algorithm change
   simply recomputes every scenario under the new model. Only the future
   runner, if it stores stamped outputs, can compare results across model
   versions — it must compare versions instead of silently recomputing.
   Engine rounding policy does not change as part of an algorithm change
   (display rounding stays at the UI boundary).

## What the metadata does not do

An ID is not a time machine. `REPLAY_LIMITATIONS` (carried on every rule set)
says this explicitly; the short form:

- **Nothing in the application preserves historical outputs.** Inputs are
  stored; results are recalculated on every load against the *current* engine
  and rules. "Stored results stay valid" is not an implemented property.
- Reproducing a past number requires the **exact engine revision** (git SHA)
  plus a **complete rule snapshot** — the year file, the cross-year
  `legalConstants.ts` of that revision, and the cohort algorithms
  (`besteuerungsanteilGrv`, `versorgungsfreibetrag`, `ertragsanteilByAge`) as
  they existed then. Matching the rule year alone is not sufficient.
- A `ruleSetId` identifies a rule **year**, not revisions within it — pair it
  with `revision` and the content fingerprint.
- Cross-year cohort tables are parametrised over retirement years inside one
  rule set; they are not year rule files.
- The metadata's provenance is scoped to the tax areas named in `scope`; it
  does not snapshot the whole engine.
- There is no implemented mechanism that carries old outputs across a
  calculation-model change — nothing stores outputs, so nothing is preserved,
  migrated, or "kept bound" to a model version. Stamps only describe
  provenance.

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

## Statutory-literal inventory status

Centralized during #376 and its review rounds (behavior-preserving; each with
its citation, a pin, and a consumption/mutation test):

| Location | Literal | Now lives in | Test |
|----------|---------|--------------|------|
| `src/engine/salary.ts` (`calculateVorsorgepauschale2026`) | `1_900` | `legalConstants.payrollTax.vorsorgepauschaleKvPvAvCap` (§39b EStG PAP cap on KV + PV + AV) | `src/engine/salary.test.ts` — cap binds at 16 000 gross, −100 cap drops VPA by exactly 100 |
| `src/engine/bavWarnings.ts` (`computeBavMinimumEntitlement`) | `160` | `legalConstants.bav.minimumEntitlementDivisor` (§1a Abs. 1 S. 1 BetrAVG) | `src/engine/bavWarnings.test.ts` — doubling the divisor halves the minimum conversion |
| `src/engine/salary.ts` (`careEmployeeRateForChildren`) | `0.0025`, `4` | `legalConstants.care.beitragsabschlagPerFurtherChild` / `beitragsabschlagMaxFurtherChildren` (§55 Abs. 3a SGB XI) | `src/engine/salary.test.ts` — discount schedule + mutation wiring |
| `src/engine/childEligibility.ts` | `25` | `legalConstants.childEligibility.under25WindowYears` (Kinderbegriff, §55 Abs. 3a SGB XI as cited in this repo) | `src/engine/childEligibility.test.ts` — window boundary + mutation wiring |

Scope of the underlying scans: the #376 sweep covered the tax / soli paths
(`tax.ts`) and the payroll / bAV paths found in review; the §55 Abs. 3a SGB XI
pair above was found by independent review, not by that sweep. Treat the
engine as *believed clean*, not proven clean — a fresh full sweep over
`src/engine/**` non-test code belongs in the next annual-update checklist.

Not items: `capitalGains.solidarityRate` is aliased to
`legalConstants.soli.rate` (one 5.5 % definition, #376); comment-only value
mentions (e.g. `riester.ts` "4 % / 2 100") restate `src/rules/` values for
readers and are fine. Any new engine literal found by review is a P0 per
`CLAUDE.md`; put year-dependent values in `de2026.ts`, statute-fixed values
in `legalConstants.ts` — and if in `legalConstants.ts`, add the export to the
`legalRuleData` catalog (the exhaustiveness test enforces it).
