# bAV Contract Research Germany 2026

Last researched: 2026-04-28

This note summarizes German betriebliche Altersversorgung (bAV) rules that matter for the calculator model: contribution limits, tax and social-security treatment, employer subsidies, payout rules, costs, portability, and differences between contract / promise types.

It is not legal, tax, or financial advice. The goal is to make the assumptions in the tool explicit and keep future implementation work source-backed.

## Executive Summary For The Tool

- The calculator should distinguish two dimensions:
  - Durchfuehrungsweg: Direktversicherung, Pensionskasse, Pensionsfonds, Unterstuetzungskasse, Direktzusage.
  - Zusageart / guarantee style: Leistungszusage, beitragsorientierte Leistungszusage, Beitragszusage mit Mindestleistung, reine Beitragszusage / Sozialpartnermodell.
- For common modern salary-conversion bAV via Direktversicherung / Pensionskasse / Pensionsfonds, 2026 contributions are tax-free up to 8% of the general pension BBG and social-security-free up to 4%.
- 2026 values:
  - RV / AV BBG: 101,400 EUR/year, 8,450 EUR/month.
  - GKV / PV BBG: 69,750 EUR/year, 5,812.50 EUR/month.
  - Tax-free bAV cap: 8,112 EUR/year, 676 EUR/month.
  - SV-free bAV cap: 4,056 EUR/year, 338 EUR/month.
  - Minimum conversion if the legal entitlement is exercised: 296.63 EUR/year, about 24.72 EUR/month.
  - KV Freibetrag for Betriebsrenten in 2026: 197.75 EUR/month for Pflichtversicherte / KVdR; PV uses a Freigrenze, not a Freibetrag.
- The statutory 15% employer subsidy is route-sensitive: it applies to Entgeltumwandlung through Pensionsfonds, Pensionskasse, or Direktversicherung, insofar as the employer saves social-security contributions. Direktzusage and Unterstuetzungskasse may have employer contributions, but the statutory subsidy rule in Sec. 1a Abs. 1a BetrAVG is not the same automatic rule for those routes.
- High earners above the GKV/PV BBG receive no health/care contribution saving on conversion; earners above the RV/AV BBG receive no social-security saving at all. The later bAV payout can still be KV/PV-liable if the person is in statutory health insurance.
- Product costs and guarantee drag can dominate the tax benefit. For tool comparisons, the decisive input is not only the gross contribution but also employer subsidy, fee model, guaranteed / expected return, Rentenfaktor, payout mode, KV/PV status in retirement, and reduction in statutory pension entitlements.

## 2026 Constants

| Item | 2026 value | Tool effect |
|---|---:|---|
| RV / AV BBG | 101,400 EUR/year; 8,450 EUR/month | Basis for 4% and 8% bAV limits; also determines whether conversion reduces pension / unemployment contributions. |
| GKV / PV BBG | 69,750 EUR/year; 5,812.50 EUR/month | Determines whether conversion saves health / care contributions during employment. |
| Sec. 3 Nr. 63 EStG tax-free cap | 8% RV BBG = 8,112 EUR/year; 676 EUR/month | Taxable wage reduction for modern Direktversicherung, Pensionskasse, Pensionsfonds. |
| SV-free cap | 4% RV BBG = 4,056 EUR/year; 338 EUR/month | Social-security wage reduction; above this, contributions can still be tax-free but not SV-free. |
| Entgeltumwandlung legal entitlement ceiling | 4% RV BBG = 4,056 EUR/year | Employee can require salary conversion up to this amount, subject to tariff restrictions. |
| Entgeltumwandlung minimum | 1/160 Bezugsgroesse = 296.63 EUR/year | UI could warn on tiny monthly conversions below about 24.72 EUR/month if modeling legal entitlement. |
| Statutory employer subsidy | 15% of converted salary, capped by employer SV saving | Applies for Direktversicherung / Pensionskasse / Pensionsfonds when employer saves SV contributions; collective agreements can differ. |
| Betriebsrente KV Freibetrag | 197.75 EUR/month | For KVdR / Pflichtversicherte: KV only on excess amount. |
| Betriebsrente PV Freigrenze | 197.75 EUR/month | For PV: if above threshold, PV on the full Betriebsrente / Versorgungsbezug amount. |
| Capital payout KV/PV spreading | 1/120 per month for max 120 months | Lump-sum bAV should be converted to a monthly Versorgungsbezug for KV/PV calculation. |
| Sec. 100 EStG low-earner subsidy in 2026 | Employee gross limit 2,575 EUR/month; additional employer contribution 240-960 EUR/year; tax credit 30%, max 288 EUR | This is employer-side support, not salary conversion. BRSG II raises values from 2027. |

Sources: Bundesregierung 2026 BBG overview; Deutsche Rentenversicherung BBG overview; BetrAVG Sec. 1a; EStG Sec. 3 Nr. 63; SvEV Sec. 1; AOK bAV / BRSG pages; SGB V Secs. 226, 229; Verbraucherzentrale bAV article.

## The Five Durchfuehrungswege

| Type | Core structure | Tax / SV during contribution | Payout tax | Portability / duration | Cost and risk notes | Tool implications |
|---|---|---|---|---|---|---|
| Direktversicherung | Employer takes out a life / pension insurance on the employee. Employee has direct claim against insurer at insured event. | Usually Sec. 3 Nr. 63 EStG: tax-free up to 8% RV BBG; SV-free up to 4%. | Funded tax-free amounts are later taxable under Sec. 22 Nr. 5 EStG. | Portable to new employer; employee can often continue privately after leaving. Payout usually not before age 62 for newer contracts. | Often commission / insurance wrapper costs, guarantee costs, Rentenfaktor risk. | Current default route for the tool. Needs fee inputs, Rentenfaktor, payout mode, employer subsidy, KV/PV. |
| Pensionskasse | Legally independent pension institution, often employer / industry linked; employee has direct claim. BaFin-supervised. | Similar Sec. 3 Nr. 63 treatment for modern contributions. | Usually Sec. 22 Nr. 5 for tax-favored contributions. | Portable; private continuation possible. Benefits usually due when earned income ceases / retirement age is reached. | Generally more conservative, lower return potential than Pensionsfonds; possible benefit adjustment risk depending on setup. | Can share most calculation logic with Direktversicherung, but return / fee / guarantee assumptions may differ. |
| Pensionsfonds | Legally independent fund-like pension institution; employee has direct claim. BaFin-supervised. | Similar Sec. 3 Nr. 63 treatment for modern contributions. | Usually Sec. 22 Nr. 5 for tax-favored contributions. | Portable; private continuation possible. AOK notes max 30% capital payout at retirement for Pensionsfonds. | More investment freedom, higher return potential, higher downside risk; PSVaG insolvency protection creates employer cost. | Should allow different return / volatility / guarantee assumptions; restrict or warn on full lump-sum payout for Pensionsfonds. |
| Unterstuetzungskasse | Separate support fund funded by employer contributions and returns; employee's legal claim is against employer, not the fund. | No wage inflow in contribution phase for employee; often used for higher contributions above Sec. 3 Nr. 63 limits. Entgeltumwandlung is possible. | Benefits are nachtraeglicher Arbeitslohn under Sec. 19 EStG; employer withholds wage tax. | No statutory right for employee to continue contributions privately after leaving. Entgeltumwandlung-funded entitlements are immediately vested. PSVaG insolvency protection. | Employer liability remains; often reinsured. Administrative / PSVaG and reinsurance costs matter. | Needs separate contribution-tax logic; current Sec. 3 Nr. 63 cap model is not a perfect fit. Statutory 15% subsidy should not be assumed automatically. |
| Direktzusage / Pensionszusage | Employer directly promises benefits and pays from company assets, usually backed by provisions / reinsurance / CTA. | No wage inflow when promise is granted or funded internally; Entgeltumwandlung possible. | Benefits are nachtraeglicher Arbeitslohn under Sec. 19 EStG; employer withholds wage tax. Capital payouts may be eligible for Sec. 34 Fuenftelregelung when requirements are met. | No private continuation of contributions after leaving; vested entitlement remains. PSVaG protects against employer insolvency. | Employer balance-sheet / longevity / investment risk; employee has employer-credit-risk mitigated by PSVaG. | Needs a different accumulation representation: not always a visible individual insurance balance. Current "capital pot + fee model" can approximate only reinsured / account-like designs. |

## Promise / Guarantee Styles

| Zusageart | What is promised | Risk allocation | Tool implication |
|---|---|---|---|
| Leistungszusage | Employer promises a defined benefit, e.g. fixed pension amount or formula. | Employer bears funding / return / longevity risk. | Model as promised benefit rather than pure contribution accumulation if the plan formula is known. |
| Beitragsorientierte Leistungszusage (BOLZ) | Employer promises to convert defined contributions into a benefit under plan rules. | Employer remains liable for promised benefits; plan rules / insurer define conversion. | Current contribution-to-capital model fits many BOLZ insurance products if Rentenfaktor and guarantees are explicit. |
| Beitragszusage mit Mindestleistung | Contributions are promised with a minimum benefit, typically paid contributions minus biometric risk costs at retirement. | Employee bears more investment risk than classic defined benefit, but has minimum guarantee. | Need guarantee / floor modeling; high guarantees may reduce expected equity exposure and return. |
| Reine Beitragszusage / Sozialpartnermodell | Employer only owes contributions into a tariff-based model; no guaranteed minimum benefit. Target pension can fluctuate. | Employee bears investment / benefit level risk; employer's classic subsidiary liability is removed. | Should be modeled as no-guarantee target pension with potentially higher expected return and no guaranteed Rentenfaktor. AOK notes Sozialpartnermodell pays only pensions, not capital benefits. |

## Contribution Phase: Tax, Social Security, Employer Subsidy

### Entgeltumwandlung mechanics

Employees generally have a legal claim to convert future salary into bAV up to 4% of the general RV BBG. The employer can choose the implementation route. If no Pensionskasse or Pensionsfonds route exists, the employer must at least offer a Direktversicherung. Tariflohn can be converted only if the tariff agreement permits it.

For modern external routes under Sec. 3 Nr. 63 EStG:

- Contributions from the first employment relationship to Direktversicherung, Pensionskasse, or Pensionsfonds are tax-free up to 8% of the general RV BBG.
- Social-security freedom is only up to 4% of the general RV BBG.
- The caps apply to total eligible contributions, including employer contributions. If the employer subsidy consumes part of the cap, less of the employee conversion remains tax/SV-free.

### Employer subsidy

The statutory employer subsidy is 15% of converted salary, but only insofar as the employer saves social-security contributions, and only for the external routes named in Sec. 1a Abs. 1a BetrAVG: Pensionsfonds, Pensionskasse, Direktversicherung.

Practical modeling:

- If salary is below all BBGs, employer SV saving can exceed 15%, so the legal subsidy is normally 15%.
- If salary is between the GKV/PV BBG and RV/AV BBG, employer saves only RV and unemployment, so 15% may still be covered.
- If salary is above the RV/AV BBG, employer saves no social-security contributions, so statutory subsidy can be 0, unless the employer pays a contractual subsidy.
- Collective agreements can override details.
- Direktzusage and Unterstuetzungskasse should use contractual employer contribution inputs, not an automatic statutory minimum, unless the product documentation explicitly grants a pass-through.

### Effect on statutory pension

SV-free salary conversion reduces the pensionable wage base unless the employee was already above the RV BBG. This reduces future GRV entitlements. The tool should keep modeling this separately from product return, because it is one of the main hidden costs of Entgeltumwandlung.

## Payout Phase

### Earliest access and duration

For salary-conversion bAV, benefits generally cannot be accessed freely like a depot. Consumer guidance states that newer contracts usually allow payout only from age 62; pre-2012 commitments can use age 60. Many employers / contracts require receipt of a statutory pension or occupational pension before bAV benefits begin.

BRSG II improves flexibility by allowing Betriebsrente access when a statutory partial pension is drawn. For the tool, retirement age below 62 should be treated as a warning / special case, not a normal bAV payout assumption.

### Income tax

- Direktversicherung, Pensionskasse, Pensionsfonds funded under Sec. 3 Nr. 63: later benefits are generally fully taxable under Sec. 22 Nr. 5 EStG to the extent contributions were tax-favored.
- Direktzusage and Unterstuetzungskasse: no wage tax during the contribution / promise phase; benefits are nachtraeglicher Arbeitslohn under Sec. 19 EStG. Running pensions can use Versorgungsfreibetrag rules. Capital payouts may be eligible for Sec. 34 Fuenftelregelung when conditions are met.
- Old pre-2005 Direktversicherung / Sec. 40b cases can have special tax treatment; even if income-tax-free, statutory KV/PV can still apply to bAV-sourced payouts.

### KV / PV on Betriebsrenten

For statutory health insurance retirees:

- Betriebsrenten / Versorgungsbezuege are generally liable for full health and care contribution rates, not only the employee half.
- For KVdR / Pflichtversicherte, 2026 KV uses a 197.75 EUR/month Freibetrag: only the amount above it is KV-liable.
- PV uses the same value as a Freigrenze: if total Versorgungsbezuege exceed 197.75 EUR/month, PV applies to the full amount.
- The Freibetrag / Freigrenze applies once across all bAV / Versorgungsbezuege, not per contract.
- For voluntary statutory health-insurance members, the KVdR Freibetrag generally does not apply; broader income types can also be contribution-liable under Sec. 240 SGB V.
- For lump-sum bAV, Sec. 229 SGB V spreads the capital over 120 months: 1/120 of the payout is treated as monthly Versorgungsbezug for up to 10 years.

## Costs And Economic Drivers

The important cost drivers for the tool are:

- Abschluss- / Vertriebskosten: often front-loaded or spread over the first years; can be painful if the employee changes employer early.
- Contribution fees: percentage deducted from each payment.
- Annual asset / administration fee: Verbraucherzentrale flags annual running costs above 1% as a major hurdle, especially over 30+ year terms.
- Fixed monthly policy fee: hurts small contributions disproportionately.
- Guarantee cost: capital guarantees or high nominal preservation requirements reduce equity exposure and expected return.
- Rentenfaktor: converts capital to lifelong pension. Low guaranteed Rentenfaktoren can make annuitization unattractive even when accumulation looks good.
- Biometric riders: disability / survivor cover may be valuable, but should be modeled as cost if the tool compares pure retirement savings.
- PSVaG / employer administration cost: mainly employer-side but can influence the employer's willingness to subsidize.

### Concrete fee examples found

These are examples, not market averages. Use them to calibrate realistic input ranges and warning thresholds.

| Source / product example | Contribution setup | Acquisition / distribution cost | Contribution admin cost | Asset / fund cost | Pension-phase cost | Effektivkosten / impact |
|---|---:|---:|---:|---:|---:|---:|
| Public Allianz Direktversicherung InvestFlex proposal, 2023 | 292 EUR/month from 2023-09 to 2053-08; gross contribution sum 105,120 EUR | 2.50% of gross contribution sum = 2,628 EUR, charged as 438 EUR/year in years 1-6 | 4.50% of each gross contribution = 157.68 EUR/year | 0.60% p.a. of policy value plus selected fund costs of 0.18% p.a. in the proposal | 1.75% of each paid pension | 1.37 percentage points RIY / Effektivkosten |
| AXA Relax Rente Comfort Plus cost-transparency deck, 2026 example | 100 EUR/month, 37-year contribution period | 2.50% of gross contribution sum = 1,110 EUR | 9.75% of annual contribution = 117 EUR/year | 0.70% p.a. of capital before cost surplus, 0.4764% p.a. after cost surplus; free investment OGC 0.25% p.a. | Not extracted in the shown example | Break-even against paid-in contributions after about 11 years at 4%/4% scenario, about 9 years at 4%/6% scenario |
| Financial-planner bAV Fondspolice example "ALPHA" | 200 EUR/month for 359 months | Included in RIY, not split out | Included in RIY | Included in RIY | Not stated | PIB showed 0.81-0.83 pp RIY; authors recalculated about 0.85 pp at 4% and 0.99 pp at 6%. At 4%, no-cost capital 136,854 EUR vs 118,524 EUR after costs = 18,331 EUR loss. At 6%, no-cost 194,703 EUR vs 163,245 EUR = 31,458 EUR loss. |
| Advisory / market heuristic for ETF-based policies | General modern ETF policy, not bAV-specific | Varies | Varies | Varies | Varies | Good ETF-based policies often land around 0.6-1.0% RIY; values above 2.0% are usually too expensive for an ETF-based contract. Treat this as a warning heuristic, not a legal threshold. |
| Unterstuetzungskasse advisory example | General U-Kasse / reinsured setup | Typical provision model includes about 2.50% of total paid contributions | Included | Included | Included | Typical U-Kasse effective costs cited at 1.50-2.50%; provisionsfreie / net-tariff examples around 0.80%. Treat as directional because U-Kasse setup differs strongly by employer. |

Concrete cost lines to support in the model:

- `acquisitionCostPct`: realistic examples include 2.50% of planned gross contribution sum.
- `acquisitionCostSpreadYears`: examples spread acquisition / distribution cost over 5-6 years.
- `contributionFee`: realistic examples include 4.50% and 9.75% of contributions.
- `annualAssetFee`: examples include 0.60-0.70% p.a. on policy value, before external fund costs.
- `fundFee`: examples include 0.18-0.25% p.a. for selected low-cost funds; active funds can be much higher. The current tool only has one annual asset fee, so it should either include both wrapper and fund fee or split them later.
- `pensionPayoutFee`: real examples include 1.75% of each paid pension. The current tool does not appear to model a separate pension-phase admin fee; it should.
- `fixedMonthlyFee`: not in the Allianz / AXA examples above, but public offer discussions often show fixed policy fees. The field is already present and should stay.

### Effective-cost impact example

For intuition, assume a 28-year-old pays 200 EUR/month gross into bAV until age 67 and receives a 15% employer subsidy, so 230 EUR/month enters the contract. Assume 5.0% gross annual return before product costs for 39 years.

| Effektivkosten | Net return after costs | Capital at 67 | Capital lost vs no-cost 5% case |
|---:|---:|---:|---:|
| 0.0% | 5.0% | 322,055 EUR | 0 EUR |
| 0.5% | 4.5% | 285,772 EUR | 36,283 EUR |
| 1.0% | 4.0% | 254,072 EUR | 67,984 EUR |
| 1.5% | 3.5% | 226,353 EUR | 95,703 EUR |
| 2.0% | 3.0% | 202,093 EUR | 119,962 EUR |
| 2.5% | 2.5% | 180,841 EUR | 141,215 EUR |

This table is deliberately simple: it ignores tax, KV/PV, guarantees, Rentenfaktor, and GRV reduction. It shows why the tool should treat 0.5 percentage points of annual cost as a major variable over a full working life.

Consumer-facing sources are skeptical of low-subsidy Entgeltumwandlung. Verbraucherzentrale says the legal 15% minimum is often not enough to offset disadvantages and suggests that much higher employer subsidies can be needed, especially when the alternative is a low-cost ETF portfolio and the bAV contract has high costs.

For comparisons, the tool should avoid judging a bAV only by "tax savings". It should compute:

- net monthly cost during employment,
- total product contribution including employer money,
- fees and guarantee drag,
- statutory pension reduction,
- tax and KV/PV in retirement,
- after-tax lump-sum value where legally available,
- net pension / annuity value using the contract Rentenfaktor,
- employer-change / portability risk as a warning rather than a numeric value unless assumptions are supplied.

## Portability, Employer Change, And Illiquidity

- Direktversicherung, Pensionskasse, Pensionsfonds: legally portable to a new employer and often privately continuable, but in practice new employers may resist taking over old contracts. A new contract can create new acquisition costs or worse guarantees.
- Unterstuetzungskasse and Direktzusage: no private continuation right for future contributions after leaving, but Entgeltumwandlung-funded entitlements are immediately vested.
- bAV assets are generally illiquid before retirement and cannot be used like private wealth for house purchase / emergency liquidity.
- Inheritance is limited by contract survivor-benefit rules. It is not equivalent to a fully inheritable ETF depot.
- During accumulation, bAV claims can be protected from seizure / means testing more strongly than free assets, but this should be treated as qualitative context.

## Current Tool Fit And Gaps

Already aligned:

- 2026 bAV tax-free and SV-free caps are represented.
- Statutory employer subsidy is capped by employer SV saving.
- Employer subsidy plus employee conversion consumes the total tax/SV-free bAV caps.
- GRV pension reduction from SV-free conversion is modeled.
- Retirement KV Freibetrag and PV Freigrenze are modeled.
- bAV payout tax mode distinguishes Sec. 3 Nr. 63 routes, Sec. 40b old contracts, Direktzusage, and Unterstuetzungskasse.
- Payout modes include Leibrente, Zeitrente, Kapitalverzehr, and Rentenfaktor.

Potential gaps / follow-up work:

- Make statutory 15% subsidy route-aware. It should default automatically only for Direktversicherung / Pensionskasse / Pensionsfonds, not blindly for Direktzusage / Unterstuetzungskasse.
- Add a Sozialpartnermodell / reine Beitragszusage flag. It affects guarantees, employer liability, return assumptions, and likely disables lump-sum payout.
- Add validation / warnings for Pensionsfonds lump sums above 30%.
- Add warning for bAV payout before age 62 unless modeling an old pre-2012 commitment or a special contract.
- Add minimum conversion warning below 296.63 EUR/year if the user frames the input as legal Entgeltumwandlung.
- Add optional Sec. 100 EStG employer low-earner subsidy modeling, especially from 2027 once BRSG II raises the limits.
- Add voluntary-GKV-retiree mode clearly: no KVdR Freibetrag and broader income contribution base.
- Add employer-change scenario / surrender-or-paid-up scenario because acquisition costs and portability friction are a major economic risk.
- Add explicit "guarantee level" input, because 80-100% nominal guarantees materially change expected return versus a free ETF.
- Add display text explaining that tax/SV savings are partly timing effects: later income tax and KV/PV can reverse much of the contribution-phase advantage.

## Source Notes

- BMAS, Entgeltumwandlung: employee entitlement, employer choice of route, tariff precedence, 15% employer subsidy: https://www.bmas.de/DE/Soziales/Rente-und-Altersvorsorge/Zusaetzliche-Altersvorsorge/Betriebliche-Altersversorgung/entgeltumwandlung.html
- BetrAVG Sec. 1a: legal salary-conversion entitlement, minimum amount, statutory employer subsidy: https://www.gesetze-im-internet.de/betravg/__1a.html
- EStG Sec. 3 Nr. 63: 8% tax-free cap for Pensionsfonds / Pensionskasse / Direktversicherung: https://www.gesetze-im-internet.de/estg/__3.html
- SvEV Sec. 1: 4% social-security-free cap: https://www.gesetze-im-internet.de/svev/__1.html
- Bundesregierung, 2026 social-security ceilings: https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514
- Deutsche Rentenversicherung, 2026 BBG values: https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Arbeitgeber-und-Steuerberater/summa-summarum/Lexikon/B/beitragsbemessungsgrenze.html
- AOK Arbeitgeber, Durchfuehrungswege, portability, Pensionsfonds / Unterstuetzungskasse / Direktzusage notes: https://www.aok.de/fk/sozialversicherung/betriebliche-altersversorgung-bav/durchfuehrungswege-bav/
- AOK Arbeitgeber, BRSG / Sozialpartnermodell / 2026 caps / Sec. 100 EStG: https://www.aok.de/fk/sozialversicherung/betriebliche-altersversorgung-bav/betriebsrentenstaerkungsgesetz-aenderungen-in-der-bav/
- Bundesregierung, BRSG II partially in force on 2026-01-22: https://www.bundesregierung.de/breg-de/aktuelles/betriebsrente-2381928
- BMAS, BRSG II FAQ: https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/FAQ-betriebsrentenstaerkungsgesetz/faq-zweites-gesetz-zur-aenderung-des-betriebsrentenstaerkungsgesetzes.html
- Finanzverwaltung NRW, taxation of bAV payouts by route: https://www.finanzamt.nrw.de/steuerinfos/privatpersonen/renten-und-pensionen/leistungen-aus-der-betrieblichen-altersversorgung
- AOK Arbeitgeber, 2026 Freibetrag / Freigrenze for Versorgungsbezuege: https://www.aok.de/fk/tools/weitere-inhalte/beitraege-und-rechengroessen-der-sozialversicherung/beitragssaetze-bei-versorgungsbezuegen/
- SGB V Sec. 226: KV Freibetrag legal basis: https://www.gesetze-im-internet.de/sgb_5/__226.html
- SGB V Sec. 229: Versorgungsbezuege and 1/120 rule for lump sums: https://www.gesetze-im-internet.de/sgb_5/__229.html
- Verbraucherzentrale, bAV / Entgeltumwandlung advantages, disadvantages, costs, 2026 thresholds: https://www.verbraucherzentrale.de/wissen/geld-versicherungen/altersvorsorge/betriebliche-altersvorsorge-gehaltsumwandlung-wann-lohnt-sich-das-7675
- Finanztip, practical 2026 bAV contribution and retirement-phase notes: https://www.finanztip.de/betriebliche-altersvorsorge/entgeltumwandlung/
- GDV, how Effektivkosten / RIY include acquisition, admin, and fund costs and reduce annual return: https://www.gdv.de/gdv/themen/leben/effektivkosten-richtig-lesen-12442
- AXA, "Kosten verstehen" 2026 deck with bAV / IVI cost examples: https://entry.axa.de/axa-makler/pb/site/me-2022/get/documents_E-816278627/makler-extranet/AXA_Makler/Privat/Vorsorge/Private%20Altersvorsorge/Relax%20Rente/Kosten%20verstehen_2026.pdf
- Public Allianz Direktversicherung InvestFlex proposal PDF, used only as a concrete example, not as a representative market average: https://www.wertpapier-forum.de/applications/core/interface/file/attachment.php?id=172120
- Bundesverband Finanzplaner, bAV Fondspolice examples and recalculated cost impact: https://www.bundesverband-finanzplaner.de/fachartikel/effektivkosten-altersvorsorgeprodukte
- DYNO, bAV Effektivkosten example 1.52% vs 0.48%: https://heydyno.de/an-altersvorsorge-erkl%C3%A4rt/was-sind-die-effektivkosten-der-betrieblichen-altersvorsorge
- Finanzcoach, U-Kasse cost heuristic and net-tariff comparison: https://www.finanzcoach.org/unterstuetzungskasse-gesellschafter-geschaeftsfuehrer/
