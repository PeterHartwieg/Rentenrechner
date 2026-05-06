---
title: "B3: Atoms — audit-flag taxonomy (`high_cost_active`, `weak_guarantee`, `low_flexibility`, `missing_offer_data`)"
Status: done
Severity: P2
Type: AFK
Area: optimiere-vorsorge / rules engine / content
---

## What to build

Add four new atoms to the rules engine in `src/app/recommendations.ts`
that flag per-instance audit signals the upcoming
`OptimiereVorsorgeModal` overview will surface as chips. Thresholds and
priorities are locked in `.scratch/optimiere-vorsorge/decisions.md` §4.

## Acceptance criteria

- [ ] `AtomId` union extended with: `'weak_guarantee'`,
      `'low_flexibility'`, `'missing_offer_data'`, `'high_cost_active'`.
      (Note `'funding_cap_hit'` is added by B1 — coordinate with the
      orchestrator.)
- [ ] Four new rules added to `runRules` with the exact thresholds from
      `decisions.md` §4:

  **`high_cost_active` (priority `medium`)** — emits per-instance when:
  - `instance.status === 'active'`, **and**
  - `slot ∈ {bav, insurance, basisrente}`, **and**
  - `wrapperAssetFee + fundAssetFee + pensionPayoutFeePct >
    HIGH_FEE_THRESHOLD` (the existing `0.012` constant).

  Atom `context: { instanceId, riyDecimal }`.

  **`weak_guarantee` (priority `medium`)** — emits per-instance when:
  - `slot ∈ {insurance, bav, basisrente, riester}` (products with a
    guarantee component), **and**
  - `Garantieleistung at retirement < 0.8 × cumulative paid contributions
    over the contract runtime`.

  Garantie value resolution: read the existing per-instance Beitrags-
  garantie field where present (search `src/domain/instances.ts` for
  `beitragsgarantie` or equivalent on each guarantee-bearing instance
  type); when only `garantiezins` is set, derive expected
  Garantieleistung as `cumulativePaid × (1 + garantiezins)^runtime`. If
  neither is set, **do not emit** (no signal, not a flag).

  Atom `context: { instanceId, garantieEUR, paidEUR }`.

  **`low_flexibility` (priority `low`)** — emits per-instance when:
  - `defaultHaircutFor(instanceId) ≥ 0.10` (reuse the helper from
    `contractDecisions.ts`, exporting it if needed), **and**
  - `payoutMode === 'leibrente'`, **and**
  - `slot ∈ {bav, insurance, riester}`.

  Atom `context: { instanceId }`.

  **`missing_offer_data` (priority `medium`)** — emits per-instance when:
  - Any field listed in `PRODUCT_EVIDENCE_FIELDS[productId]` (from
    `src/app/evidence.ts`) carries `evidence === 'model_estimate'` on
    this instance.

  Atom `context: { instanceId, missingFields: string[] }`.

- [ ] German display templates added to
      `src/content/recommendationCopy.ts` for each new atom. Headlines
      should be short chip-suitable phrases:
  - `high_cost_active`: `"Hohe Kosten"` / body `"Effektivkosten p.a.: ..."`
  - `weak_guarantee`: `"Schwache Garantie"` / body explains what fraction of paid-in capital is guaranteed.
  - `low_flexibility`: `"Eingeschränkt flexibel"` / body explains lock-in + Stornoabzug.
  - `missing_offer_data`: `"Angebotsdaten fehlen"` / body lists which fields are estimates.
- [ ] Pure rules — order-independent and idempotent. Adding the new
      rules must not change atom emission for the existing fixtures in
      `recommendations.test.ts`.
- [ ] Tests in `recommendations.test.ts`:
  - One positive + one negative case per atom on synthetic workspace
    fixtures.
  - Joint test: a fixture with one bAV exceeding `high_cost_active`
    threshold and one Riester with `model_estimate` evidence emits both
    atoms with the correct `instanceId` in context.
  - `runRules(input).filter((a) => a.id === 'weak_guarantee')` is empty
    on a healthy workspace (no false positives).

## Implementation notes

- Helper exposure: `defaultHaircutFor` is currently file-private in
  `contractDecisions.ts`. Export it (and re-export the
  `DEFAULT_HAIRCUT_BY_PREFIX` map if needed) so the rule can reuse it
  rather than duplicate the prefix table. Keep the existing tests
  passing.
- Garantie-leistung derivation: search the per-product instance types
  in `src/domain/instances.ts` for guarantee-related fields. The exact
  field names differ by product (e.g. `guaranteedAnnuityEUR`,
  `beitragsgarantieFraction`, `garantiezinsAnnualPct`). Pick the most
  authoritative per slot; document the choice with a short comment per
  rule.
- Rule order: insert the new rules near the existing
  `paid_up_high_fee_warning` rule — same audit-signal flavour. Keep the
  active/paid-up split clean (`high_cost_active` is the active-state
  twin of `paid_up_high_fee_warning`).
- React-free.

## Red test (write first)

For each atom: a failing test that asserts the atom id appears in
`runRules(input)` for a fixture that should trigger it. Fails on missing
atom id type / missing rule.

## Blocked by

None. Independent of B1 / B2 / B5. (B4 depends on the new atoms.)
