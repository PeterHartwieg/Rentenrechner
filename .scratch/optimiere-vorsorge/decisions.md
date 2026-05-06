# Decisions — Optimiere deine Vorsorge

Status: **locked**
Created: 2026-05-05
Locked: 2026-05-05 (maintainer reviewed and approved all proposed answers verbatim)
Resolves: open questions in `PRD.md` and the HITL gate on `.scratch/group-g-qa/issues/59-optimiere-vorsorge-backlog.md`.

Implementation issues under `.scratch/optimiere-vorsorge/issues/` are now
ready to dispatch per `Plan.md`. The maintainer-note checkboxes below are
all ticked; if a future iteration needs to revisit any section, change
`Status` back to `proposed` and add a date in the section being amended.

---

## 1. Disclaimer treatment

**Decision (proposed):** A dedicated `disclaimer-acknowledge` step is the
first screen of the `OptimiereVorsorgeModal`. It cannot be skipped. The user
must explicitly click `Verstanden, weiter` to proceed. Acknowledgement is
**not persisted** — every modal open returns to this step. A persistent
banner at the top of every subsequent modal step repeats the core message in
short form.

**Why stronger than the session banner:** the user is exploring decisions
about contracts they actually own. The advice-risk profile is meaningfully
higher than for the rest of the calculator (which compares hypothetical
products at illustration level). One modal-scoped click is a low-friction
way to make the posture intentional without weakening the existing
session-only `DisclaimerBanner`.

**Why not persist the acknowledgement:** persisting would create the same
"permanently dismissed" footgun that `CLAUDE.md` calls publication-blocking
for the main banner. Modal-scoped state is the safer pattern and matches
the existing `DisclaimerBanner` invariant (`sessionStorage`, never
`localStorage`).

### Proposed German copy

**Acknowledge step heading:**

> Hinweis: Modellrechnung, keine Beratung

**Acknowledge step body (paragraphs):**

> Mit `Optimiere deine Vorsorge` kannst du durchspielen, was passiert, wenn
> du an deinen bestehenden Verträgen etwas änderst — zum Beispiel Beiträge
> erhöhst, einen Vertrag beitragsfrei stellst, kündigst oder zu einem
> anderen Anbieter überträgst.
>
> Das Tool erstellt dazu unverbindliche Modellrechnungen auf Basis deiner
> Eingaben und der gesetzlichen Werte für 2026. **Es ersetzt keine
> persönliche Beratung durch Steuer-, Renten- oder Versicherungsexpertinnen
> und ‑experten.**
>
> Vor einer echten Vertragsänderung — vor allem bei Kündigung, Übertragung
> oder Reduzierung von Garantien — sprich bitte mit einer unabhängigen
> Fachperson. Stornoabzüge, Steuerprivilegien und Zulagenrückforderungen
> hängen vom konkreten Vertrag ab und können hier nur näherungsweise
> geschätzt werden.
>
> Wenn du fortfährst, bleibt dein bestehender Plan unverändert. Du
> erstellst nur What-if-Szenarien, die du jederzeit wieder löschen kannst.

**Acknowledge button label:**

> Verstanden, weiter

**Cancel button label:**

> Abbrechen

**Persistent banner (renders at top of overview, instance, confirm, saved
steps):**

> Modellrechnung — keine Steuer-, Renten- oder Versicherungsberatung. Vor
> echten Vertragsänderungen bitte unabhängige Fachperson hinzuziehen.

**Maintainer note (please confirm or edit):**

- [x] Heading text approved
- [x] Body text approved
- [x] Button labels approved
- [x] Persistent banner text approved

---

## 2. `Beitrag senken` inclusion

**Decision (proposed):** **Excluded from v1.** The issue's acceptance
criteria list four specific actions (Beitrag erhöhen, beitragsfrei stellen,
kündigen + frei investieren, Riester→AVD übertragen, unverändert lassen);
`Beitrag senken` is not among them.

**Rationale:** scope discipline. The symmetric "lower the contribution"
case is real but adds another decision card per contract, another delta
chip, and another statutory edge case (e.g. Riester Sockelbeitrag €60/year
under §86 EStG). It would not change architecture but would dilute
copy/test/legal-review scope. Easier to add in v2 once the audit pattern
is established.

**Maintainer note:**

- [x] Confirm exclusion from v1
- [x] If included, the action card label is `Beitrag senken` and the
      generator mirrors `beitragErhoehenWhatIf`

---

## 3. Entry-point placement

**Decision (proposed):** Add an `Optimiere deine Vorsorge` button inside
`RentenluckeDashboard`, placed **next to the existing `Lücke schließen`
button**. Same dashboard zone, same visual treatment, same act-of-clicking
pattern.

**Rationale:** discoverability + symmetry. Users already know `Lücke
schließen` lives there; a sibling button makes the parallel obvious.
Avoids fragmenting the dashboard into more entry zones.

**Visibility rule:** the button is shown only when the workspace contains
at least one `active` or `paid_up` instance. With zero existing contracts
the audit has nothing to act on — show a disabled state with tooltip
`Sobald du mindestens einen Vertrag erfasst hast, kannst du Optionen
durchspielen.` rather than hiding it (so the user learns the feature
exists).

**Maintainer note:**

- [x] Placement next to `Lücke schließen` approved
- [x] Disabled-with-tooltip behaviour for empty workspace approved
- [x] Button label `Optimiere deine Vorsorge` approved (alternatives:
      `Verträge optimieren`, `Bestehende Verträge prüfen`)

---

## 4. Audit thresholds

**Decision (proposed):** lock the four flag thresholds as below. Each is a
pure, deterministic rule on the existing `ProductResult` / `Instance`
shape.

### `high_cost_active`

- **Condition:** instance `status` is `active`, slot ∈ `{bav, insurance,
  basisrente}`, and `wrapperAssetFee + fundAssetFee + pensionPayoutFeePct >
  HIGH_FEE_THRESHOLD` (`0.012` from `recommendations.ts`).
- **Priority:** `medium`.
- **Why this threshold:** matches the existing `paid_up_high_fee_warning`
  trigger in `recommendations.ts:329`. Reusing the constant keeps "high
  fee" consistent across surfaces.

### `weak_guarantee`

- **Applicable products:** insurance, bAV (Direktversicherung +
  Pensionskasse with guarantee), Basisrente, Riester. Not ETF, not AVD-
  Standarddepot (no statutory guarantee component).
- **Condition:** `Garantieleistung at retirement < 0.8 × cumulative paid
  contributions over the contract runtime`. The Garantie value comes from
  the per-instance Beitragsgarantie field where present, or 0 when the
  user has only entered a Garantiezins. (Engine derivation pinned in
  `Plan.md` slice B3.)
- **Priority:** `medium`.
- **Why 80%:** below 80% of paid-in capital the headline "Garantie" no
  longer covers nominal contributions. Pessimistic but defensible — the
  user is exploring alternatives, not making a sale.

### `low_flexibility`

- **Condition:** `defaultHaircutFor(instanceId) ≥ 0.10` **and**
  `payoutMode === 'leibrente'` **and** slot ∈ `{bav, insurance, riester}`.
- **Priority:** `low`.
- **Why:** captures "money locked in for life with a meaningful surrender
  penalty". Excludes Basisrente intentionally — Basisrente has its own
  legal lockup framing (`§10 Abs. 2 EStG`), surfaced through the
  no-kündigen rule rather than this flag.

### `missing_offer_data`

- **Condition:** any field in `PRODUCT_EVIDENCE_FIELDS[productId]` (from
  `src/app/evidence.ts`) carries `evidence === 'model_estimate'` on this
  instance.
- **Priority:** `medium`.
- **Why:** tells the user "your audit is partly based on guesses." Direct
  CTA to attach real numbers if available.

### `funding_cap_hit` (new, surfaced on `Beitrag erhöhen` only)

- **Condition:** proposed `newMonthlyEUR × 12` exceeds the relevant
  statutory cap for the contract's product slot:
  - bAV: `de2026.bav.section363LimitAnnual` (§3 Nr. 63 EStG).
  - Basisrente: `de2026.basisrente.section10Limit` (§10 Abs. 3 EStG).
  - Riester: `2_100` (§10a EStG flat).
  - AVD: `de2026.altersvorsorgedepot.contributionCapAnnual` (per-contract).
  - Insurance / ETF: cap is `Infinity` — flag never emits.
- **Priority:** `high`.
- **Why high:** if the user proposes a value above the cap, the simulation
  result is misleading. We do not auto-clamp — the user might want to see
  "what if I exceeded the cap" — but we make the cap visible.

**Maintainer note:**

- [x] All five threshold definitions approved
- [x] Priorities (`medium / medium / low / medium / high`) approved
- [x] If a threshold should differ, edit inline above

---

## 5. Cross-flow combination with `Lücke schließen`

**Decision (proposed):** **out of scope for v1.** A user who wants to
model "surrender my pAV **and** save more in ETF" creates two separate
what-ifs and compares them in the workspace scenario list.

**Rationale:** combining the two flows requires a unified what-if shape
that carries both `WorkspaceDelta`-style mutations and the recommender's
allocation-style additions. Today these are separate pipelines for good
reason — Lücke is allocation-driven (back-solving against a target net
cash burden), Optimiere is action-driven (applying mutations to
instances). Trying to fuse them in v1 risks shipping a confusing UI.

**v2 scope (placeholder):** an "Optionen kombinieren" affordance that lets
the user select what-ifs from both modals and merge them into one.
Requires a separate decision on naming, ordering, and how the
back-solve interacts with mutated baselines.

**Maintainer note:**

- [x] Confirm v1 exclusion
- [x] Note any v2 priority preference

---

## 6. Default surrender-haircut bands and labelling

**Decision (proposed):** keep the existing defaults from
`contractDecisions.ts` `DEFAULT_HAIRCUT_BY_PREFIX`:

| Slot | Default haircut | Source |
|---|---|---|
| pAV (insurance) | 10% | §169 VVG, < 20 years |
| bAV | 5% | §169 VVG; §3 Nr. 63 has no statutory minimum-payout rule |
| Riester | 15% | provider Stornoabzug + §21 EStG Zulagenrückforderung |
| AVD | 10% | AltZertG §2 cap on "reasonable" |
| ETF | 0% | no surrender penalty (liquid) |
| Basisrente | n/a | capital payout legally prohibited (§10 Abs. 2 EStG) |

The existing `kuendigenWhatIf` description already labels the haircut as
`(🤔 Schätzung)`. Keep that label; do not promote it to "exact". The new
modal's Optimiere copy should reinforce this — "Stornoabzug ist eine
pessimistische Schätzung; den genauen Wert findest du im Vertrag oder
beim Versicherer."

**Maintainer note:**

- [x] Keep existing 5 / 10 / 15 / 10 / 0% defaults
- [x] Approve the 🤔-Schätzung labelling
- [x] Approve the additional sentence in the kündigen card body

---

## 7. Save model

**Decision (proposed):** N what-ifs (one per `(contract, decision)`
pair), `origin: 'recommender'`. Mirrors `ContractDecisionMenu`'s existing
save model exactly — it is already the right shape for the workspace
scenario list.

**Default scenario name format:**

- `Beitrag erhöhen`: `"{contractLabel} – Beitrag {neuerEUR} €/Monat"`
- `Beitragsfrei`: `"{contractLabel} – beitragsfrei ab Alter {age}"`
- `Kündigen ohne Reinvest`: `"{contractLabel} – kündigen"`
- `Kündigen + Reinvest in Y`: `"{contractLabel} → {targetLabel}"`
- `Übertragen` (certified): `"{contractLabel} → {targetLabel}"`
- `Übertragen` (create_new): `"{contractLabel} → neues {productLabel}"`

User can edit each name on the confirm step.

**Maintainer note:**

- [x] Save model approved
- [x] Default name format approved (will be implemented as a labels
      module in `optimiereCopy.ts`)

---

## 8. Mode scope

**Decision (proposed):** **combine-mode only.** The audit operates on the
workspace's `baseline.assumptions.{bav,etf,insurance,basisrente,
altersvorsorgedepot,riester}` instance arrays. Compare-mode workspaces do
not have multi-instance contracts; the closest equivalent (compare mode's
singleton scenario) is already optimisable through the regular edit flow.

The dashboard button is therefore visible only when `combineMode === true`
in `App.tsx`'s state.

**Maintainer note:**

- [x] Confirm combine-mode-only scope
- [x] If compare-mode is wanted in v1 too: it requires reusing the
      singleton-view projection in `portfolioProjection.ts`. Adds non-
      trivial scope and is recommended deferred to v2.

---

## 9. Out-of-scope confirmations

The following are intentionally not part of v1. Confirm by ticking each
item:

- [x] **OCR / document upload** of existing contracts. Separate Group B
      item, gated on backend introduction.
- [x] **Cross-flow combination** with `Lücke schließen` (see §5).
- [x] **Auto-clamp** Beitrag erhöhen to caps. Emits flag, user decides.
- [x] **`Beitrag senken`** action (see §2).
- [x] **Permanent dismissal** of disclaimer-acknowledge (see §1).
- [x] **Commercial-license gating** — default to free per `CLAUDE.md`.

---

## Sign-off

When all checkboxes above are ticked or amended, set:

```
Status: locked
```

at the top of this file, and the issues under
`.scratch/optimiere-vorsorge/issues/` can be filed and worked AFK per
`Plan.md`.
