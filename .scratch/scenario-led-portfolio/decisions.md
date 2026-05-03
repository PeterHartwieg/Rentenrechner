# Group G — design decisions log

Working scratchpad. Each decision is captured here as it crystallises during the grilling session. The PRD and Plan are synthesised from this log at the end.

Source docs:
- `docs/user-scenarios.md`
- `docs/portfolio-schema-design.md`
- `BACKLOG.md` Group G section
- `CLAUDE.md` "Current state"

---

## Q10 — PRD / Plan / Issue boundary

**Decision.**

- **PRD.md** carries *what* and *why* only: condensed personas, capabilities with priorities, success criteria, scope boundaries, non-goals, plain-language acceptance criteria. No file paths, no schema, no sequencing.
- **Plan.md** carries *how* and *in what order*: architecture decisions (materialised what-ifs, instance-id format, `PortfolioAdapter` shape — most of `portfolio-schema-design.md`), tech sequencing, test strategy, risk register.
- **Issues** are tracer-bullet vertical slices (~1–3 days each), each pointing back to its PRD capability and its Plan section.

**Acceptance criteria** live in the PRD in plain user-task form (e.g. "Bernd can add 2 bAV contracts and see one combined retirement-income line"). Issues restate them as test cases.

**Anti-patterns to avoid:** PRD that locks in tech (then it is a Plan), Plan that re-states user value (drift from PRD).

---

## Q1 — Compare-products mode vs. combine-products mode

**Decision: keep both (option C).**

Compare-mode is the existing flow; combine-mode is the new portfolio flow. They share the same engine (per-product simulators, tax/KV-PV pipelines, fees/RIY) and only diverge in orchestration (`PortfolioAdapter` for combine; today's `simulateRetirementComparison` for compare) and view layer.

**Why both, not combine-only:**

- Insurance brokers and investment advisors are the explicit commercial-license audience (CLAUDE.md, BACKLOG.md). They need product-vs-product comparison to advise/sell. Existing competitor tools have poor UX — a real revenue lever.
- Compare-mode works today and serves consumers reasonably for the "is bAV worth it?" question (Anna). Dropping it is a regression for both audiences.
- The schema-design's `PortfolioAdapter` already wraps singletons as length-1 arrays — the singleton path doesn't need to die for combine-mode to work. Two **orchestrations** on one engine, not two engines.
- License-pricing optionality preserved: today's compare-mode stays free; future broker-specific extensions (batch scenarios, branded PDF, broker product database) can gate when we add them.

**What we give up:** more surface area to maintain, two landing CTAs to keep coherent.

### Q1.1 — Mode selection

**Decision: c — mode-as-workspace-property + dual landing CTAs.**

Landing has two first-class entry points: "Mein Plan" (combine) and "Produkte vergleichen" (compare). The chosen mode is a property of the `Workspace` and round-trips through share-URLs and the scenario library.

- Why not entry-trigger only: brokers don't enter via consumer triggers; would bury compare-mode.
- Why not default+toggle: hides compare-mode as "old way", bad signal for brokers.

Consumer-first visual weight on landing (combine is the larger card, compare the smaller), but compare is always visible.

### Q1.2 — Compare-mode evolution

**Decision: B — compare-mode gains an equal-input sub-mode for brokers, keeps the equal-cash sub-mode for consumers.**

- *Equal-cash* (today's behaviour): bAV drives net cost, ETF/pAV match. Default for consumer entry.
- *Equal-input* (new): user enters a single monthly contribution; every selected product runs at that nominal amount. Default for broker entry / explicit toggle.
- Tax-deferral on bAV still flows through the salary calc in both sub-modes.

Compare-mode stays singleton-per-product. Multi-instance is a combine-mode feature.

### Q1.3 — One mode per workspace

**Decision: yes.** A workspace is either compare-mode or combine-mode. Switching modes spawns a new workspace. Implied by "mode-as-workspace-property".

---

## Q3 — Baseline semantics (combine-mode only)

Compare-mode workspaces carry no baseline. Below is combine-mode only.

### Q3.a — How is baseline created?

**Decision: auto-pin from inventory completion.** No explicit "save as baseline" button. The portfolio entered in the inventory wizard *is* the baseline; the word "baseline" surfaces in copy ("Baseline: dein aktueller Plan") but no extra step to lock it.

### Q3.b — Empty baseline

**Decision: empty baseline is valid.** Represents "do nothing → only GRV in retirement". Clean-slate users (Anna) get a GRV-only baseline immediately; their first what-if ("Plan: €100 bAV + €100 ETF") is a meaningful diff against it. Consistent framing across all personas.

### Q3.c — Re-baselining

**Decision: edit baseline in-place by default; one-click "Archive as Baseline {year}, start fresh" for annual check-ins.**

When a baseline is edited in-place, every derived what-if shows a "Baseline hat sich geändert" badge with two actions: *re-base on current baseline* (re-apply the user's deltas) or *keep as-is* (freeze). Materialised what-ifs (per schema doc §1) make this opt-in.

---

## Q5 — Household mode scope and sequencing

**Decision: split — P1 schema foundation, P2 UX surfacing.**

- **P1 (with singleton→instance migration):** `InstanceCommon.ownedBy?: 'self' | 'partner'` (already in schema-design.md §2) is wired through but defaulted `'self'` and silent in the UI. `Workspace` reserves a `partner?: PersonalProfile` slot, defaulted `undefined`, no UI surface. Tests assert round-trip.
- **P2:** partner-profile entry, per-instance owner toggle, Ehegattensplitting UI, joint Wunschnetto, inter-spouse optimisation hints.

**Why split:**

- Schema risk: singleton→instance is already a load-bearing migration. Stacking dual-profile compounds the risk. Pre-baking the partner slot now avoids a third schema break (`v2 → v3`) later.
- 9 of 10 personas are single-profile. Marginal user benefit of household-in-P1 is one persona; cost is delaying P1 for everyone.
- Manual workaround exists for Eva+Frank: compute each spouse separately, combine in spreadsheet. Annoying for one release cycle, not blocking.
- Brokers advising couples can use compare-mode (one workspace per spouse) until P2.

**Tradeoff accepted:** Eva+Frank persona is partially served at launch.

---

## Q2 — Inventory wizard flow (combine-mode entry)

### Q2.a — Wizard structure

**Decision: checklist + per-product expandable cards.** Single screen with 7 product checkboxes ("Hast du das?"); each ticked product expands inline. "+ weitere bAV hinzufügen" allows multiple instances of the same type. "Fertig & Vergleich starten" finalises baseline.

Random-access fits existing-portfolio users. Branched flow stays for clean-slate (Q2.b).

### Q2.b — Routing on entry

**Decision: landing → "Mein Plan" → "Hast du schon Verträge?" split.**

- "Ja" → inventory wizard (Q2.a).
- "Nein" → existing `GuidedSetup` minimum-input flow, preserved unchanged.

Compare-mode bypasses both wizards; lands directly on the comparison input drawer.

### Q2.c — Modal vs sidebar after first entry

**Decision: modal full-screen on first inventory; sidebar editing thereafter.**

After baseline exists, edits happen in the existing input sidebar. Modal wizard re-appears only via the topbar "Geführter Einstieg" button.

### Q2.d — Per-product card depth (revised)

**Decision: three layers per instance card.**

**Layer 1 — Always visible** (anchor + high-impact fields):

- Vertragsbeginn, Aktueller Wert, Monatlicher Beitrag, Status, Anbieter (free text).
- Plus product-specific high-impact fields the engine refuses to silently guess:
  - bAV: Durchführungsweg, Effektivkosten p.a. (hint "typisch 0.5–2.0%"), Rentenfaktor (Leibrente).
  - pAV: Payout mode, Effektivkosten p.a. (hint "typisch 1.0–2.5%"), Rentenfaktor (Leibrente).
  - Riester: Payout mode, Zulagen-Status (auto from kids, override visible).
  - Basisrente: Payout mode, Rentenfaktor (Leibrente), Effektivkosten p.a.
  - ETF: TER p.a.
  - AVD: Glidepath ein/aus.
  - GRV: Entgeltpunkte (or estimated from years, today's `rentengap` path).

**Layer 2 — Evidence badge** on every value:

- Green "Bestätigt" → `evidence: 'user_confirmed'`.
- Yellow "🤔 Schätzung" → `evidence: 'model_estimate'`. One-click "Wert ist okay" promotes to confirmed.
- Blue "Beleg" → `evidence: 'statement'` (later, OCR).

**Layer 3 — Expandable "Details" disclosure** (collapsed by default):

- Fee decomposition, KVdR/freiwillig, Beitragsdynamik, statutory subsidy split, vintage auto-detection chips (§40b a.F., Halbeinkünfte, pre-2005) with tooltips.

### Cross-cutting guardrail (PRD-level)

**No silent default masquerading as user data.** Every retirement-income figure derived from at least one `model_estimate` value carries an explicit confidence indicator on the dashboard. The recommendation copy never claims a number is "correct" when it leans on estimates — it says "auf deinen Schätzungen ergibt sich…" or similar. Exports (PDF, CSV) repeat the indicator next to affected figures.

Protects consumers from over-confidence; protects brokers (who'll use the tool with clients) from advising on guessed numbers. Aligns with the disclaimer guardrail in CLAUDE.md.

---

## Q7 — Multiple instances UX

### Q7.a — Modeling Übertragung (transfer between contracts)

**Decision: B — event log.**

`InstanceCommon` carries a `transferEvents: { year, targetInstanceId, amountEUR }[]` field (or this lives at workspace level — Plan decides). Source instance remains in the portfolio after partial transfer; ongoing accumulation continues on whatever capital was not transferred. Original contract privileges (pre-2005 Halbeinkünfte, Garantiezins, etc.) stay attached to the residual.

Engine implication (Plan level): `projectAccumulation` extends from "single starting capital" to "starting capital + injection events". Year-0 transfers reduce to today's `initialCapital` behaviour (Riester→AVD); year>0 transfers need the new engine capability.

### Q7.b — Three-card per-contract template (Weiterführen / Beitragsfrei / Kündigen / Übertragen)

**Decision: per-instance dashboard affordance, generates what-if scenarios.**

Button "Optionen für diesen Vertrag" on each active or paid-up instance card opens a panel offering pre-built what-ifs against the current baseline:

1. **Weiterführen** (status quo).
2. **Beitragsfrei stellen** (status → `paid_up` at age `today`; reuses existing pAV two-phase math).
3. **Kündigen** (status → `surrendered` with `surrenderHaircutPct`; one-off cash event with optional re-allocation to ETF/AVD/Cash).
4. **Übertragen auf {target}** (where compatible target exists; partial-transfer slider via Q7.a's event log).

User picks any subset to materialise as named what-ifs. Lights up Karin (pAV), Dilan (bAV).

### Q7.c — Multi-instance results visualization

**Decision: aggregated by product type at top level; per-instance expansion on demand.**

- Dashboard summary: "bAV: €X aktuelles Kapital, €Y/Monat in Rente (2 Verträge)" — sums across instances.
- Click expands to per-instance breakdown.
- Lifecycle chart plots one line per instance + a thicker portfolio-total line.
- Retirement-income waterfall sums the full portfolio at top level; per-instance contributions in the expansion.

### Q7.d — Compare-mode and the schema

**Decision: instance arrays uniformly across both modes.**

Compare-mode workspaces use length-1 instance arrays per product (no UI affordance for a second instance). Combine-mode uses any-length. The fair-comparison invariant (equal-cash) and equal-input sub-mode are orchestration-level concerns at the compare-mode entry point, not schema-level.

Schema-design.md needs only a clarifying note (not a structural revision).

---

## Q4 — Recommender ranking criteria

**Decision: D — default ranking by primary metric + explicit trade-off labels per candidate, with optional re-sort.**

- **Primary metric:** median Netto-Rente. Secondary tie-break: total expected lifetime cash.
- **Hard filters:** Wunschnetto floor (if set) demotes candidates that don't reach it; user-stated flexibility need (later input) demotes illiquid candidates.
- **Trade-off labels** per candidate, generated by the rules engine (e.g. "Höchste Rente, aber Kapital nicht verfügbar bis 67"; "Steuer-Hebel größter, aber Aktienrisiko in 12 Jahren spürbar").
- **User can re-sort** by clicking column headers (flexibility, risk, tax leverage, lifetime cash). Default ranking + reasons stay visible above.
- **Transparency:** dashboard shows "Rangliste: nach mittlerer Netto-Rente" — never hidden.

**Rules-engine staging:**

- **P1 thin layer** — `src/app/recommendations.ts` (~200 LOC): generates 3–4 obvious what-ifs, ranks by median Netto-Rente, attaches trade-off labels from a hard-coded rule list (~10–20 rules).
- **P3 richer layer** — tax-bracket-aware, KVdR-aware, age-aware, more candidates, broader rule set.

P1 thin is enough for Bernd's killer feature; P3 iterates.

---

## Q6 — Trigger-card mapping

### Q6.a — New triggers as data entries

**Decision: extend `src/content/triggers.ts`** with new rows for `job_change`, `inheritance`, `pkv_switch`, `pre_retirement`, `old_insurance_check`, `tax_max`, `freelance_basisrente`, `annual_checkin`.

### Q6.b — Per-trigger wizard logic as small components

**Decision: dispatched-by-data.** Each trigger has a `wizardComponent: () => Component` reference in `triggers.ts`. `GuidedSetup.tsx` (or successor `TriggerRouter.tsx`) dispatches by data lookup, no per-trigger switch statement. Each wizard is a small focused component.

```ts
{
  id: 'job_change',
  title: 'Ich habe den Job gewechselt',
  description: '...',
  wizard: JobChangeWizard,
  visibleProducts: ['bav', 'etf'],
  whatIfTemplates: ['old_bav_keep', 'old_bav_transfer', 'old_bav_freeze'],
}
```

### Q6.c — Sequencing

**Decision: P1 ships dispatch infrastructure only; each new trigger is an independent P2 ticket.**

- P1: `TriggerRouter` / extended `GuidedSetup`, plus `triggers.ts` schema for new fields. Existing 4 triggers (`bav_offer`, `etf_vs_insurance`, `rentengap`, `expert`) migrate without behaviour change.
- P2: each new trigger ships independently as its own ticket with its own wizard component.

This avoids tying P1 ship to the design of 8 new wizards.

---

## Q8 — Cross-product interaction text

**Decision: hybrid — rules engine emits structured explanation atoms; per-atom German templates render text.**

- Rules engine in `src/app/recommendations.ts` (co-located with Q4's recommender — same fact base, two consumers).
- Atoms shape: `{ id: 'bav_cap_full', priority, context: { capUsedPct, nextLeverProductId, ... } }`.
- Mapping table renders each atom to a German sentence. Bilingual support (P2) = swap the table.
- `decisionLogic.ts` (today's compare-mode dashboard summary) is folded in or kept as sibling — Plan-level decision.

**Surfaces consuming the engine:**

- Recommender card (combine-mode dashboard, primary)
- Per-instance contract cards (vintage detection, cap detection)
- What-if comparison card ("Plan B beats Plan A because…")
- PDF/CSV exports (plain-text rendering of same atoms)
- Compare-mode dashboard summary (today's `decisionLogic.ts` flow)

**Sequencing:**

- **P1:** rules engine skeleton + Bernd's "next-EUR-X" rules + vintage detection rules (Karin, Inge) + cap detection (Jens) — all already partly computable from engine output, just needs surfacing.
- **P2:** trigger-specific rules per trigger as triggers ship.
- **P2/P3:** inter-spouse hints (depends on household mode), tax-bracket-aware rules.

---

## Q9 — Variable-income / stress modes

**Decision: B — variable-income is a what-if scenario with parameter overrides; not a separate mode.**

- Any what-if can override any field, including `profile.grossSalary`. Clara's "Stress-Test Einkommen €40k" is a what-if labeled "Plan: Niedriges Jahr €40k" with one delta from baseline.
- The `freelance_basisrente` trigger (Q6) ships with a scenario template that auto-generates three what-ifs at low / median / high income.
- Power users / brokers can build any custom override (inflation, retirement age, KVdR toggle) as a what-if by editing the field in a saved scenario.

Multi-year variable income (alternating €40k/€90k) deferred to P3 — requires year-by-year salary input.

### General stress framing in the recommendation card

Separately, BACKLOG.md "Prominent uncertainty and stress framing" (P2) means surfacing the existing Monte Carlo (P10/Median/P90) and `sensitivity.ts` output more prominently. P2.

**Sequencing:**

- **P1:** what-if-with-overrides infrastructure (a what-if can carry a delta on any field).
- **P2:** prominent stress surfacing (Monte Carlo + sensitivity in the headline recommendation, not buried in Details).

### Existing engine capabilities to lean on

`monteCarlo.ts` and `sensitivity.ts` (both shipped) feed the rules engine's hard filters (Q4) and trade-off labels (Q8) — e.g. "Plan A liefert höchste Median-Rente, aber im P10 liegt sie unter deinem Wunschnetto."

---

## Grilling complete (2026-05-03)

All 10 design questions resolved. Synthesis order:

1. `PRD.md` (combine-mode + compare-mode capabilities, personas, acceptance criteria, cross-cutting guardrails, non-goals, launch-readiness appendix).
2. `Plan.md` (architecture, schema, module map, sequencing, test strategy, risk register).
3. `issues/01..NN-*.md` (P1 tracer-bullet slices, each ≈1–3 days).
