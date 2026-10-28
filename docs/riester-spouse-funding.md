# Legacy Riester funding (#420, follow-up to #434)

`engine/riesterHousehold.ts` owns the spouse/contract funding calculation.
`buildPortfolioFunding` supplies owner-tagged contracts, payroll tax bases and
annual schedules. Compare mode uses the same function when explicit spouse
facts are present; `solveRiesterOwnFromNet` therefore solves against that funding
calculation. The recommender sizes a top-up against the change in household cash
cost, including allowance changes on the other spouse's contract.

- Each direct saver has a separate deduction ceiling; unused capacity is not
  transferred. Direct/indirect spouses share the increased ceiling, with direct
  contributions taking priority after reserving the indirect minimum.
- Indirect eligibility needs the own-contract minimum. Full allowances also
  depend on the direct spouse's minimum contribution. Underpayment reduces both
  allowances. Child expiry is recalculated each year.
- Only eligible, qualifying contracts enter the pool. The additional refund is
  divided by considered own contributions, first between spouses and then within
  each owner's eligible pool. Allowances are not part of that allocation ratio.
- Actual payments are preserved above the deduction ceiling. This corrects the
  old contribution-scaling approximation; it is why the former cap tests and
  four internal scenario baselines change. `headroom.fundedAnnual` now means
  the deductible amount, not all money paid into the contracts.
- `fundingEligible` is a contract condition; `eligibility` describes the person.
  Conflicting person facts, duplicate child claims, and missing spouse records
  block the household headline through the shared readiness selector (including
  exports). Legacy diagnostic inputs can still be inspected in engine tests.
- Prior-year relevant income can be entered explicitly. If absent, the existing
  current-payroll estimate remains. A separate Riester assessment setting is
  available; it does not change AVD, other product funding, or retirement taxes.

Sources: [§10a(3)–(4) EStG](https://www.gesetze-im-internet.de/estg/__10a.html),
[§79 EStG](https://www.gesetze-im-internet.de/estg/__79.html),
[§86 EStG](https://www.gesetze-im-internet.de/estg/__86.html), and the
[BMF letter of 5 October 2023, paragraphs 100–120](https://usth.bundesfinanzministerium.de/esth/2025/B-Anhaenge/Anhang-01a/I/anhang-1a-I.html).
The BMF's 1,700/110 considered-contribution example is pinned separately from
its historical tax tariff; the refund in our test uses the 2026 tariff.

## Remaining limitations

This is legacy Riester only. AVD's regime and its statutory values are unchanged.
The income-tax base still uses the existing payroll approximation. Compare mode
accepts the second person's taxable income explicitly and displays only the
selected contract's allocated support; use combine mode for both contracts.
Without spouse facts, the legacy single-person compare approximation remains
and the visible interim note applies.

The retirement model still does not distinguish funded and unfunded Riester
payout components. Child attribution remains all entered children to one
person. These product questions are recorded in Peter's handoff, not decided
by this funding patch. The interim UI note remains in a removable component.
