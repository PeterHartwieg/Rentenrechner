# ETF Depot Tax Research Germany 2026

Last researched: 2026-04-28

This note summarizes German ordinary taxable ETF depot rules that matter for the calculator model: capital-gains taxation, Sparer-Pauschbetrag, solidarity surcharge, Investmentsteuergesetz partial exemptions, Vorabpauschale, 2026 Basiszins, FIFO / withdrawal simplifications, and accumulation vs payout assumptions.

It is not legal, tax, or financial advice. The goal is to make the assumptions in the tool explicit and keep future implementation work source-backed.

## Executive Summary For The Tool

- A normal private ETF depot is Schicht 3 / free private wealth, not a certified pension product. It is funded from net income and remains liquid / inheritable, but taxable investment income is handled under EStG / InvStG.
- Relevant taxable investment income from public investment funds includes distributions, Vorabpauschalen, and gains on sale of fund shares. The app currently models a no-distribution accumulating ETF path plus drawdown / sale taxation.
- For ordinary private investors, capital income is generally taxed at 25% plus solidarity surcharge. Without church tax this is 26.375% on the taxable capital income after partial exemption and Sparer-Pauschbetrag.
- The Sparer-Pauschbetrag is 1,000 EUR/year for single filers and 2,000 EUR/year for jointly assessed spouses. The app currently uses the single 1,000 EUR value and assumes it is fully available for ETF calculations in each relevant year unless a helper is called with allowance 0.
- For an Aktienfonds / equity ETF, 30% of investment income is tax-free under InvStG partial exemption, so 70% remains taxable before the Sparer-Pauschbetrag. Mixed funds get 15%; real-estate funds 60% / 80%; other funds 0%.
- The 2026 Basiszins for Vorabpauschale is 3.20% per BMF notice dated 2026-01-13. The maximum 2026 Basisertrag is therefore 2.24% of the relevant beginning-of-year fund value before distribution and performance caps.
- Vorabpauschale is a deemed annual investment return. It is capped by actual positive fund performance and reduced by distributions. It is deemed received on the first working day of the following calendar year. For 2026, the tax event is in early 2027.
- Later sale gains must be reduced by Vorabpauschalen already assessed during the holding period. The app tracks cumulative gross Vorabpauschale and subtracts it from exit / payout gains, which is the right conceptual hook.
- Real German sale taxation uses FIFO for fungible securities in collective custody. The app's ETF payout schedule uses an average gain-ratio / proportional cost-basis drawdown. That is a deliberate simplification and can shift the timing of tax during retirement withdrawals.

## 2026 Constants

| Item | 2026 value / rule | Tool effect |
|---|---:|---|
| Capital-income tax rate | 25% | Base rate for taxable ETF income under EStG Sec. 32d / Kapitalertragsteuer under Sec. 43a. |
| Solidarity surcharge on capital-income tax | 5.5% of capital-income tax | Effective rate without church tax: 25% * 1.055 = 26.375%. |
| Church tax | Not modeled | Real tax can be higher / formula-adjusted if church-tax liable. |
| Sparer-Pauschbetrag single | 1,000 EUR/year | App value: `rules.capitalGains.saverAllowance = 1000`. |
| Sparer-Pauschbetrag married | 2,000 EUR/year | Not currently represented as a filing-status-specific capital-gains allowance. |
| Aktienfonds partial exemption | 30% tax-free | Default ETF assumption: `equityPartialExemption = 0.3`. |
| Mischfonds partial exemption | 15% tax-free | Supported by generic `partialExemption`, but no ETF fund-type UI beyond numeric assumption. |
| Domestic real-estate fund partial exemption | 60% tax-free | Supported mathematically by `partialExemption`, not ETF-default behavior. |
| Foreign real-estate fund partial exemption | 80% tax-free | Supported mathematically by `partialExemption`, not ETF-default behavior. |
| Other / bond / money-market fund partial exemption | 0% | Supported mathematically. |
| 2026 Basiszins | 3.20% | App value: `rules.capitalGains.basiszins = 0.032`. |
| Basisertrag factor | 70% of Basiszins | For 2026: 0.032 * 0.7 = 2.24% before caps / distributions. |
| Max 2026 Aktienfonds VP tax before allowance | About 0.414% of beginning value | 2.24% VP * 70% taxable * 26.375%, assuming enough performance and no distributions / allowance. |
| Zufluss timing | First working day of following calendar year | App deducts during the annual projection step; timing is approximate. |
| FIFO | First acquired shares deemed first sold | App drawdown uses average gain ratio, not lot-level FIFO. |

Sources: EStG Secs. 20, 32d, 43a; SolZG 1995 Sec. 4; InvStG Secs. 16, 18, 19, 20; BMF 2026 Basiszins notice; Finanzverwaltung NRW investment-fund explainer.

## Rule Sections

### Ordinary capital-income route

Investment-fund income for a private ETF depot is capital income. InvStG Sec. 16 defines the relevant investment income buckets as distributions, Vorabpauschalen, and gains from selling investment fund shares under Sec. 19.

For private investors, the flat capital-income tariff is generally 25% under EStG Sec. 32d. EStG Sec. 43a also uses 25% for the normal capital-gains tax withholding route. SolZG 1995 Sec. 4 adds a 5.5% solidarity surcharge; for capital income under EStG Sec. 32d, the regular 5.5% applies without the ordinary income-tax Milderungszone.

Tool implication:

- `calculateCapitalGainsTax` correctly represents 25% plus 5.5% Soli when church tax is ignored.
- The function is a capital-income helper, not a general income-tax helper. It should stay separate from `calculateIncomeTax2026`.
- Church tax, loss pots, foreign tax credits, NV certificate, and Guenstigerpruefung are out of scope today.

### Sparer-Pauschbetrag

EStG Sec. 20 Abs. 9 sets the Sparer-Pauschbetrag at 1,000 EUR for individual taxpayers and 2,000 EUR for jointly assessed spouses. Actual advertising expenses are not deducted separately for capital income.

Tool implication:

- The app has a single `rules.capitalGains.saverAllowance = 1_000`.
- This is fine for a single-filer default, but married filing / shared allowance is not modeled.
- The allowance is treated as fully available for ETF Vorabpauschale and annual payout rows. That is optimistic if the user has dividends, interest, money-market returns, or other capital income outside the modeled ETF.
- `afterTaxInvestmentCapital` passes allowance 0, which is conservative for a one-time sale but inconsistent with payout rows if the user still has unused allowance in the sale year.

### Investmentsteuer partial exemption

InvStG Sec. 20 gives partial exemptions for fund investment income. For private assets, the practical defaults are:

- Aktienfonds: 30% tax-free when the fund continuously invests more than 50% in equity participations.
- Mischfonds: 15% tax-free, half the Aktienfonds exemption, generally for at least 25% equity participation.
- Immobilienfonds: 60% tax-free; Auslands-Immobilienfonds: 80% tax-free.
- Other funds: no partial exemption.

Finanzverwaltung NRW confirms the same private-investor rates and explains that the partial exemption applies to all investment income from the relevant fund type.

Tool implication:

- The `partialExemption` parameter is general enough.
- The default ETF assumption of 30% fits a broad equity ETF, not bond ETFs, money-market ETFs, or mixed allocations.
- UI / docs should make clear that `equityPartialExemption` is a fund-tax classification input, not a personal preference.

### Vorabpauschale

InvStG Sec. 18 defines the Vorabpauschale as a deemed annual investment return. The calculation is roughly:

```text
Basisertrag = beginning-of-year fund value * Basiszins * 70%
Basisertrag is capped by actual positive fund performance including distributions.
Vorabpauschale = max(0, capped Basisertrag - distributions)
```

In the acquisition year, the Vorabpauschale is reduced by one twelfth for each full month before the acquisition month. It is deemed received on the first working day of the following calendar year. The BMF publishes the Basiszins required by InvStG Sec. 18 Abs. 4; for the 2026 calculation the BMF notice dated 2026-01-13 gives 3.20%.

Tool implication:

- `projectAccumulation` models accumulating funds with no distributions. In that no-distribution case, its `min(basisertrag, annualGrowth)` cap is directionally right.
- The monthly contribution proration matches the acquisition-year concept.
- The app subtracts the tax from investment capital. In reality, German brokers normally debit the tax from a clearing account or use a Freistellungsauftrag / loss pot / NV certificate. Selling fund shares to fund the tax is not always what happens. This affects long-run compounding.
- The app applies a full annual Sparer-Pauschbetrag in every projection year. This is a scenario assumption, not a universal legal result.
- The app records gross cumulative Vorabpauschale, not tax paid. That is the correct base to reduce later sale gains under InvStG Sec. 19.

### Sale gains and double-tax protection

InvStG Sec. 19 says gains from selling privately held investment fund shares follow the EStG capital-gain mechanics, and the gain is reduced by Vorabpauschalen assessed during the holding period. The reduction is made before applying / considering partial exemption in the sale-gain calculation.

Tool implication:

- `afterTaxInvestmentCapital` and `etfPayoutSchedule` both reduce remaining taxable gain by cumulative gross Vorabpauschale.
- This avoids double taxation in the main intended sense.
- The audit should verify whether the app's order of operations is documented as: raw sale gain minus gross VP, then partial exemption, then Sparer-Pauschbetrag, then 25% plus Soli.

### FIFO and withdrawal mechanics

EStG Sec. 20 Abs. 4 includes FIFO for fungible securities in collective custody: the first acquired securities are treated as the first sold. Current BMF Abgeltungsteuer guidance also applies FIFO on a per-depot basis.

The app does not track tax lots. It uses a proportional gain ratio:

```text
taxable gain in withdrawal year =
  gross withdrawal * max(0, capitalAtStart - remainingCostBasis) / capitalAtStart
```

Then it proportionally reduces cost basis by the gross withdrawal fraction.

Tool implication:

- The gain-ratio method is easy to understand and stable for projections.
- It is not German FIFO. For a long savings plan with rising markets, FIFO usually realizes older, lower-basis shares first, so taxes can be front-loaded compared with average-cost drawdown.
- The simplification mostly affects yearly net retirement cashflows, not the broad comparison shape, but it should be disclosed.

### Accumulation vs payout assumptions

Current ETF product behavior:

- ETF and private insurance invest the same net monthly cost as the bAV comparison benchmark.
- ETF uses only `fundAssetFee` / TER; there is no insurance wrapper fee.
- ETF always uses self-managed capital drawdown over `retirementEndAge - retirementAge`.
- ETF has `afterTaxLumpSum` for full liquidation and `etfPayoutRows` for annual drawdown taxation.
- ETF does not have lifelong annuity pooling, pension payout fees, health / care insurance deductions, lock-up, guarantees, or subsidy mechanics.

This is appropriate for a normal free depot, but not for:

- certified Altersvorsorgedepot / Riester-style products,
- Basisrente,
- bAV investment sleeves,
- private insurance wrappers holding ETFs.

## Implementation Implications

- Keep ETF tax in the capital-gains helper path, not in the retirement income-tax pipeline.
- Treat the partial exemption as a fund classification. Default 30% only for equity funds.
- Add a filing-status or "available capital-income allowance" input before treating the 1,000 EUR Sparer-Pauschbetrag as a precise result for all users.
- Consider an explicit option for how Vorabpauschale tax is funded:
  - deducted from outside cash / clearing account,
  - deducted from modeled portfolio,
  - ignored for capital compounding but shown as external tax cashflow.
- Add a disclosure / future option for FIFO vs average-cost drawdown. A full FIFO model needs tax lots from monthly contributions plus reinvested / post-tax effects.
- If distributions are later modeled, Vorabpauschale must subtract distributions and distributions themselves must be taxed in the year received.
- Keep Altersvorsorgedepot separate from ETF. InvStG Sec. 16 excludes some certified old-age contract contexts from ordinary investment-income treatment.

## Current Tool Fit And Gaps

Already aligned:

- Capital-gains tax helper uses 25% plus 5.5% Soli.
- Sparer-Pauschbetrag is represented as a rule constant.
- Partial exemption is parameterized and the default 30% fits broad equity ETF assumptions.
- 2026 Basiszins is set to 3.20%, matching the BMF 2026 notice.
- Vorabpauschale is modeled during accumulation for ETF only.
- Acquisition-year contribution proration is represented.
- Cumulative gross Vorabpauschale reduces exit / payout taxable gain.
- ETF payout uses self-managed drawdown, not annuity or insurance taxation.
- ETF fees are separate from wrapper insurance fees.

Potential gaps / follow-up work:

- Add married / joint Sparer-Pauschbetrag handling or a direct "available Sparer-Pauschbetrag" input.
- Avoid assuming the full Sparer-Pauschbetrag is available for every annual ETF calculation when other capital income exists.
- Decide whether full liquidation should use an available Sparer-Pauschbetrag. Current `afterTaxInvestmentCapital` uses 0 allowance.
- Add church tax support or explicitly label results "without church tax".
- Add distributions for distributing ETFs; current logic is effectively thesaurierend / no-distribution.
- Add loss offset / Verlustverrechnungstopf / NV certificate / Guenstigerpruefung as optional advanced settings if precision becomes important.
- Add an optional FIFO lot-level payout model; current proportional gain-ratio drawdown is not statutory FIFO.
- Adjust Vorabpauschale timing if the annual projection needs exact cashflow timing: legally the 2026 VP is received on the first working day of 2027, while the model deducts in the projection year.
- Consider modeling Vorabpauschale tax as an external tax cashflow rather than reducing ETF capital, because real brokers commonly debit the clearing account.
- Clarify that the 30% partial exemption is not available for bond / money-market ETFs.

## Implementation Audit Hooks

Files and symbols to check in a later code audit:

| File | Hook | Why it matters |
|---|---|---|
| `src/rules/de2026.ts` | `de2026Rules.capitalGains.taxRate` | Should stay 0.25 unless EStG / capital-withholding law changes. |
| `src/rules/de2026.ts` | `de2026Rules.capitalGains.solidarityRate` | Should stay 0.055 for SolZG capital-income surcharge unless law changes. |
| `src/rules/de2026.ts` | `de2026Rules.capitalGains.saverAllowance` | Single-filer 1,000 EUR only; married 2,000 EUR not separately modeled. |
| `src/rules/de2026.ts` | `de2026Rules.capitalGains.basiszins` | Must be updated annually from BMF notice for the relevant Vorabpauschale year. |
| `src/domain/products/etf.ts` | `EtfAssumptions.equityPartialExemption` | Needs validation / UI clarity for fund type. |
| `src/data/defaultScenario.ts` | `etf.annualAssetFee`, `etf.equityPartialExemption` | Defaults define ordinary equity ETF scenario: 0.20% TER, 30% partial exemption. |
| `src/engine/tax.ts` | `calculateCapitalGainsTax` | Applies partial exemption, allowance, 25% tax, 5.5% Soli; no church tax. |
| `src/engine/products/etf.ts` | `simulate` | Wires ETF funding, fees, partial exemption, lump sum, and payout schedule. |
| `src/engine/buildResult.ts` | `etfVorabpauschale` forwarding | Ensures VP is only applied for ETF-like taxable accumulation where intended. |
| `src/engine/projections.ts` | `projectAccumulation` | Computes monthly accumulation, annual VP, VP tax deduction, cumulative gross VP. |
| `src/engine/projections.ts` | `afterTaxInvestmentCapital` | Full liquidation tax; currently passes allowance 0. |
| `src/engine/projections.ts` | `netEtfPayout` | Monthly approximation helper; check whether still used / consistent with row schedule. |
| `src/engine/projections.ts` | `etfPayoutSchedule` | Annual drawdown taxation; average gain ratio, full annual allowance, not FIFO. |
| `src/engine/products/etf.test.ts` | Capital-gains / VP tests | Locks 25% + Soli, partial exemption, 2026 Basiszins, proration, payout schedule. |
| `src/engine/simulate.integration.test.ts` | ETF golden snapshots | Catches broad regressions in capital, after-tax lump sum, net monthly payout. |

## Source Notes

Primary / official sources:

- EStG Sec. 20, capital income, Sparer-Pauschbetrag, FIFO reference: https://www.gesetze-im-internet.de/estg/__20.html
- EStG Sec. 32d, 25% separate tariff for capital income: https://www.gesetze-im-internet.de/estg/__32d.html
- EStG Sec. 43a, 25% Kapitalertragsteuer withholding and partial-exemption reference: https://www.gesetze-im-internet.de/estg/__43a.html
- SolZG 1995 Sec. 4, 5.5% solidarity surcharge and capital-income rule: https://www.gesetze-im-internet.de/solzg_1995/__4.html
- InvStG Sec. 16, investment income categories: https://www.gesetze-im-internet.de/invstg_2018/__16.html
- InvStG Sec. 18, Vorabpauschale: https://www.gesetze-im-internet.de/invstg_2018/__18.html
- InvStG Sec. 19, sale gains reduced by assessed Vorabpauschalen: https://www.gesetze-im-internet.de/invstg_2018/__19.html
- InvStG Sec. 20, partial exemptions: https://www.gesetze-im-internet.de/invstg_2018/__20.html
- BMF, Basiszins to 2026-01-02 for 2026 Vorabpauschale, notice dated 2026-01-13: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html
- Finanzverwaltung NRW, private-investor investment-fund explainer and partial-exemption / Vorabpauschale overview: https://www.finanzamt.nrw.de/steuerinfos/privatpersonen/einkuenfte-aus-kapitalvermoegen/ertraege-aus-investmentfonds
- Finanzverwaltung NRW, Sparer-Pauschbetrag / Freistellungsauftrag explainer: https://www.finanzamt.nrw.de/steuerinfos/privatpersonen/einkuenfte-aus-kapitalvermoegen/sparerpauschbetrag-freistellungsauftrag
- BMF, Einzelfragen zur Abgeltungsteuer, 2025-05-14, includes FIFO guidance per depot: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Abgeltungsteuer/2025-05-14-einzelfragen-zur-abgeltungsteuer.pdf

Secondary / explanatory sources used only for context:

- Haufe overview of Basiszins / Vorabpauschale publication practice and 2026 value: https://www.haufe.de/steuern/finanzverwaltung/18-abs-4-invstg-basiszins-zur-berechnung-der-vorabpauschale_164_481896.html
