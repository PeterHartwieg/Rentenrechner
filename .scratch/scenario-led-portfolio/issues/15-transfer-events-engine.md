# 15 — TransferEvents engine support (certified + surrender_reinvest)

Status: needs-triage
Milestone: M3
Plan section: §2.5 TransferEvent shape, §3 Module map (engine-touching changes), §4 M3.6
PRD capabilities: F15
Depends on: 03

## What

Engine extension supporting two distinct kinds of inter-instance transfers, discriminated by `type`:

- **Certified transfer (`type: 'certified'`)** — §3 Nr. 55 EStG / AltZertG-subsidised transfer between same-class certified products. Examples: Riester→AVD, bAV→bAV between providers, Basisrente→Basisrente. **Tax-neutral**: cost basis preserved on the target, no taxable event. Source instance retains its tax privileges on the residual capital.
- **Surrender + reinvestment (`type: 'surrender_reinvest'`)** — taxable surrender of the source plus reinvestment of after-tax proceeds into a target. Examples: pAV→ETF, Riester→ETF (subsidy clawback applies), bAV→ETF. **Source pays surrender tax in the year of transfer**; target receives after-tax + post-haircut proceeds as a `capitalInjection`.

## Scope

### Schema

`TransferEvent` discriminated union per Plan §2.5:

```ts
type TransferEvent =
  | {
      type: 'certified'
      year: number
      sourceInstanceId: string
      targetInstanceId: string
      amountEUR: number
    }
  | {
      type: 'surrender_reinvest'
      year: number
      sourceInstanceId: string
      targetInstanceId: string
      amountEUR: number              // gross surrender amount before haircut
      surrenderHaircutPct: number    // Stornoabzug from contract terms
    }
```

### Engine extensions

- `AccumulationInput` extension: `capitalInjections?: { year: number, amount: number }[]` — defaults to `[]`. Backwards-compatible.
- `projectAccumulation` honors injections at the start of each named year (after fees, before contributions).
- `PortfolioAdapter` populates `capitalInjections` on each target's accumulation input from its inbound transferEvents (scanning all source instances), differentiated by event type.

### Per-event-type routing

**`certified`:**

- Source instance accumulation deducts `amountEUR` at year-of-transfer (after that year's contributions and fees, before next year's accumulation). Source's per-product tax routing remains unchanged on the residual.
- Target instance accumulation adds `amountEUR` as a `capitalInjection` at year-of-transfer. Target's existing cost basis remains unchanged (tax-neutral transfer).
- Compatibility validator (in `scenarioSchema.ts`):
  - Riester ↔ AVD allowed (AltZertG §1).
  - bAV ↔ bAV allowed only between same Durchführungsweg (Direktversicherung ↔ Direktversicherung; not Direktzusage ↔ Direktversicherung).
  - Basisrente ↔ Basisrente allowed (§3 Nr. 55c).
  - All cross-class certified transfers rejected.

**`surrender_reinvest`:**

- Source instance: surrender path runs at `year`. Existing engine paths (insurance: `pre2005` / `halbeinkuenfte` / `abgeltungsteuer`; bAV: `voll_versorgungsbezug` / `fuenftelregelung` / `pre2005_steuerfrei`; Riester: `§22 Nr. 5 EStG` plus subsidy clawback; AVD: `§22 Nr. 5 EStG`) compute the surrender tax. Source after-tax proceeds = `(amountEUR × (1 - surrenderHaircutPct)) - surrenderTax`.
- After-tax proceeds become `capitalInjection` on the target at year-of-transfer.
- Target's cost basis resets to the after-tax injection amount (so the target's own future tax routing treats this injection as fresh principal, not capital that has already paid tax — important to avoid double-tax on subsequent target gains).
- Source instance status remains as-is (active or paid-up); residual capital after the surrender continues to accumulate. (For full surrender — `amountEUR === current capital` — the user typically also flips `status: 'surrendered'` separately.)
- Compatibility validator: any product-class crossing (pAV → ETF, Riester → AVD-without-AltZertG-flag, bAV → ETF) is allowed under `surrender_reinvest`. ETF → pAV / bAV is rejected (you can't "reinvest" into a certified product without going through that product's contribution path).

### `simulateBav` / per-product simulators

The per-product simulators do NOT need direct knowledge of `transferEvents`. The adapter handles the projection:

- For the source instance: passes `existingCapitalAfterOutboundTransfers` to the simulator as the effective `initialCapital`.
- For the target instance: passes `capitalInjections` (an extension to `AccumulationInput`) covering inbound transfers.
- `projectAccumulation` consumes `capitalInjections` and applies them at the named years.

For `surrender_reinvest`, the source's surrender tax is computed by calling the existing surrender helper (e.g. `afterTaxInsuranceLumpSum`, `afterTaxRiesterLumpSum`) — already in the engine.

## Out of scope

- UI for transfer events (the three-card template in issue 14 drives them).
- Multi-source transfer events into the same target year (treat as sequential at the target; document in test).
- Subsidy clawback math for Riester surrender — already in engine; this issue only ensures the existing path runs at the user-set transfer year.

## Acceptance

- Year-0 certified transfer (`year === today`) reduces to today's `initialCapital` semantics on the target — Riester→AVD oracle parity preserved (the existing `riesterTransferCapital` flat field migrates to a single `type: 'certified', year: 0` event).
- Karin's `surrender_reinvest` partial transfer (50% of her 2002 pAV to ETF in 2030): source instance carries on with residual capital and the existing pre-2005 tax-free capital payout still intact for the residual at retirement; ETF instance gains the after-tax + post-haircut proceeds as initial capital injection in 2030 and grows it from there.
- Full certified transfer (`amountEUR === current capital, type: 'certified'`) leaves the source at €0; source's monthly contribution (if any) continues from year of transfer onward, growing the source from zero.
- Bernd's Riester → AVD migration what-if (already partial-supported via `riesterTransferCapital`) is a single `{ type: 'certified', year: 0, ... }` event under the new mechanism without behaviour change.
- Compatibility: `validateState` rejects `{ type: 'certified', source: AVD, target: Riester }` (illegal direction under AltZertG); rejects `{ type: 'surrender_reinvest', source: ETF, target: bAV }` (reinvestment into certified product not modeled).

## Test plan

- Oracle: existing Riester→AVD test (`riester.test.ts`, `altersvorsorgedepot.test.ts`) still passes via the new mechanism (one `type: 'certified'` event at year 0 with the original `riesterTransferCapital` value).
- New oracle: Karin's `surrender_reinvest` partial-transfer scenario produces deterministic capital trajectories on both source and target. Source's pre-2005 tax-free capital payout of the residual at retirement matches the same value as if no transfer had occurred (residual treatment unchanged).
- New oracle: bAV→bAV `type: 'certified'` transfer at year 5 — both instances carry their original Durchführungsweg-specific tax routing.
- Edge: transfer at retirement age (year of payout start) — defined behaviour: applied before payout schedule begins.
- Edge: `surrender_reinvest` with `amountEUR > current capital` clamps to current capital and emits a dev-mode warning.
- Validator: every illegal pairing rejected by `validateState`.
