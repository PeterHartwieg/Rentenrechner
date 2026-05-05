import type {
  FeeModel,
  GermanRules,
  ProductId,
  ReturnScenario,
  YearlyProjection,
} from '../domain'
import { monthlyRate } from './payoutMath'
import { calculateCapitalGainsTax } from './tax'

/**
 * Pluggable accumulation behaviors. The base loop runs with monthly contributions,
 * a constant return, and a fee model; everything else (variable returns, ETF
 * Vorabpauschale tax accrual, transferred starting capital) is opt-in via this
 * policy. Future extensions (Monte Carlo return draws, contribution escalation)
 * plug in here without changing the base signature.
 */
export interface AccumulationPolicy {
  /** Per-year return override; replaces `annualReturn` for each year (yearIndex
   *  is 0-based). Used by the Standarddepot glidepath de-risking; Monte Carlo /
   *  variable-return policies will plug in here too. */
  yearlyReturn?: (yearIndex: number) => number
  /** Apply InvStG §18 Vorabpauschale each year-end: deduct §20 KapESt on the
   *  basisertrag (capped at the annual growth), and accrue the gross cumulative
   *  amount on each row so cost-basis carryover at exit can subtract it.
   *
   *  `saverAllowanceOverride(yearIndex)` (0-based) lets combine-mode share the
   *  §20 Abs. 9 EStG Sparerpauschbetrag across multiple ETF instances per year
   *  (Phase G M4 F3). Default: full `rules.capitalGains.saverAllowance`. */
  vorabpauschale?: {
    rules: GermanRules
    partialExemption: number
    saverAllowanceOverride?: (yearIndex: number) => number
  }
  /** Starting balance — used when capital transfers between products
   *  (#71 Riester → AVD per AltZertG transfer; paid-up insurance phase 2).
   *  Default 0. */
  initialCapital?: number
  /** Beitragsdynamik: each year's monthly user cost, product contribution and
   *  employer contribution scale by `(1 + annualRate)^yearIndex`. Total
   *  planned contributions used by `acquisitionCostPct` are expanded to the
   *  geometric sum so Abschlusskosten reflect the full contract horizon
   *  (Versicherungs-Beitragssumme convention). 0 / undefined = static. */
  contributionGrowth?: { annualRate: number }
  /** Year-specific monthly contribution overrides. Used for dated subsidies
   *  such as child allowances that begin only once the child is born. */
  yearlyContributions?: (yearIndex: number) => {
    monthlyUserCost?: number
    monthlyProductContribution?: number
    monthlyEmployerContribution?: number
  }
  /** Inbound capital injections (issue 15 — TransferEvents).
   *  Each entry adds `amount` EUR to the running capital at the START of the
   *  named contract year (year 1 = first projection year). Multiple entries
   *  in the same year sum. Applied AFTER prior-year fees and BEFORE current-
   *  year contributions so the injected capital earns growth from year-start.
   *  Year 1 injections functionally equivalent to a top-up on `initialCapital`
   *  but tracked separately so callers can distinguish between starting
   *  capital and inbound transfers. */
  capitalInjections?: { year: number; amount: number }[]
  /** Outbound capital withdrawals (issue 15 — TransferEvents source side).
   *  Each entry removes `amount` EUR from running capital at the START of the
   *  named year, after any same-year injections. Used for the source side of
   *  certified transfers and surrender_reinvest events. Negative running
   *  capital is clamped to zero. */
  capitalWithdrawals?: { year: number; amount: number }[]
  /** Cost-basis bumps (issue 15 — surrender_reinvest into ETF target).
   *  Each entry increases the cost-basis tracker by `amount` EUR at the
   *  start of the named year. Only consumed by ETF-style accumulation that
   *  reads `totalContributionsBeforeFees`; for non-ETF products this is
   *  silently tracked but unused by their tax helpers. Distinct from
   *  `capitalInjections` because the user contributed nothing — the cost
   *  basis must rise by the after-tax injection amount so the target's
   *  Abgeltungsteuer / Vorabpauschale path doesn't double-tax already-taxed
   *  surrender proceeds. */
  costBasisInjections?: { year: number; amount: number }[]
}

export interface AccumulationInput {
  productId: ProductId
  currentAge: number
  months: number
  monthlyUserCost: number
  monthlyProductContribution: number
  monthlyEmployerContribution: number
  annualReturn: number
  inflationRate: number
  scenario: ReturnScenario
  fees: FeeModel
  policy?: AccumulationPolicy
}

export interface AccumulationResult {
  capital: number
  realCapital: number
  totalUserCost: number
  totalProductContributions: number
  totalEmployerContributions: number
  totalFees: number
  totalContributionsBeforeFees: number
  cumulativeVorabpauschale: number
  rows: YearlyProjection[]
}

export function projectAccumulation(input: AccumulationInput): AccumulationResult {
  // (1-f)^(1/12): portion of capital retained after TER each month.
  const totalAssetFee = input.fees.wrapperAssetFee + input.fees.fundAssetFee
  const monthlyRetentionFactor = Math.pow(1 - totalAssetFee, 1 / 12)
  const acquisitionMonths = Math.max(1, input.fees.acquisitionCostSpreadYears * 12)
  const policy = input.policy
  const dynamicRate = policy?.contributionGrowth?.annualRate ?? 0
  const yearsTotal = input.months / 12
  // Geometric expansion of total planned contributions for Abschlusskosten
  // (Versicherungs-Beitragssumme convention: total premium summed over the
  // contract horizon with annual contribution growth applied). Falls back to
  // simple month-count multiplication when no Dynamik is configured.
  const plannedContributions = policy?.yearlyContributions
    ? Array.from({ length: Math.ceil(yearsTotal) }).reduce<number>((sum, _, yearIndex) => {
        const monthsInYear = Math.min(12, input.months - yearIndex * 12)
        const yearly = policy.yearlyContributions?.(yearIndex)
        return sum + (yearly?.monthlyProductContribution ?? input.monthlyProductContribution) * monthsInYear
      }, 0)
    : dynamicRate === 0 || Math.abs(dynamicRate) < 1e-12
      ? input.monthlyProductContribution * input.months
      : input.monthlyProductContribution * 12 *
        (Math.pow(1 + dynamicRate, yearsTotal) - 1) / dynamicRate
  const monthlyAcquisitionCost =
    input.fees.acquisitionCostPct > 0
      ? (plannedContributions * input.fees.acquisitionCostPct) / acquisitionMonths
      : 0

  let capital = policy?.initialCapital ?? 0
  let totalUserCost = 0
  let totalProductContributions = 0
  let totalEmployerContributions = 0
  let totalFees = 0
  let feesInCurrentYear = 0
  let contributionsInCurrentYear = 0
  let balanceAtYearStart = capital
  let cumulativeVorabpauschale = 0
  // Issue 15 (TransferEvents): cumulative principal added by inbound transfers.
  // Bumps cost basis on `totalContributionsBeforeFees` so ETF / Vorabpauschale
  // logic does not retax already-taxed surrender proceeds reinvested into ETF.
  let injectedPrincipal = 0
  // Index injection / withdrawal / cost-basis maps by year for O(1) lookup at
  // the start of each year. Multi-entry-same-year sums (per spec one-line note).
  // Multi-source same-target-same-year: events are summed (additive injections).
  // Equivalent to sequential year-start application because computeSurrenderTax
  // is computed from a passive projection, not running state.
  const injectionsByYear = new Map<number, number>()
  for (const inj of policy?.capitalInjections ?? []) {
    injectionsByYear.set(inj.year, (injectionsByYear.get(inj.year) ?? 0) + inj.amount)
  }
  const withdrawalsByYear = new Map<number, number>()
  for (const w of policy?.capitalWithdrawals ?? []) {
    withdrawalsByYear.set(w.year, (withdrawalsByYear.get(w.year) ?? 0) + w.amount)
  }
  const costBasisInjectionsByYear = new Map<number, number>()
  for (const cb of policy?.costBasisInjections ?? []) {
    costBasisInjectionsByYear.set(cb.year, (costBasisInjectionsByYear.get(cb.year) ?? 0) + cb.amount)
  }
  // InvStG §18: contributions made during the year are prorated by remaining months.
  // Tracks sum(investedContribution × remainingMonthsInYear / 12) for current year.
  let vpAcquisitionBaseInYear = 0
  const rows: YearlyProjection[] = []

  // When policy.yearlyReturn is set, the gross rate is recomputed at the start of each year.
  let currentMonthlyGrossRate = monthlyRate(input.annualReturn)
  // Beitragsdynamik scaling (1 + r)^yearIndex applied to every contribution at the
  // start of each year. yearIndex = 0 for the first year (no growth yet).
  let monthlyUserCost = input.monthlyUserCost
  let monthlyProductContribution = input.monthlyProductContribution
  let monthlyEmployerContribution = input.monthlyEmployerContribution

  for (let month = 1; month <= input.months; month += 1) {
    if (month === 1 || (month - 1) % 12 === 0) {
      const yearIndex = Math.floor((month - 1) / 12)
      const dynamicMul = dynamicRate !== 0 ? Math.pow(1 + dynamicRate, yearIndex) : 1
      monthlyUserCost = input.monthlyUserCost * dynamicMul
      monthlyProductContribution = input.monthlyProductContribution * dynamicMul
      monthlyEmployerContribution = input.monthlyEmployerContribution * dynamicMul
      const yearly = policy?.yearlyContributions?.(yearIndex)
      if (yearly) {
        monthlyUserCost = yearly.monthlyUserCost ?? monthlyUserCost
        monthlyProductContribution =
          yearly.monthlyProductContribution ?? monthlyProductContribution
        monthlyEmployerContribution =
          yearly.monthlyEmployerContribution ?? monthlyEmployerContribution
      }
    }

    if (policy?.yearlyReturn && (month === 1 || month % 12 === 1)) {
      const yearIndex = Math.floor((month - 1) / 12)
      currentMonthlyGrossRate = monthlyRate(policy.yearlyReturn(yearIndex))
    }

    // Issue 15 — apply transfer-event injections / withdrawals / cost-basis
    // bumps at the start of each year (month 1 of contract year). Ordering:
    // after prior-year fees (balanceAtYearStart locked), before this year's
    // contributions / fees / growth. Current-year fees have NOT yet been
    // deducted at injection time. Inject first, then withdraw, so a same-year
    // inject+withdraw pair is handled correctly. Year-1 transfers (year === 1)
    // sit on top of any policy.initialCapital with the same semantics.
    if (month === 1 || month % 12 === 1) {
      const contractYear = Math.floor((month - 1) / 12) + 1
      const inj = injectionsByYear.get(contractYear) ?? 0
      const wd = withdrawalsByYear.get(contractYear) ?? 0
      const cb = costBasisInjectionsByYear.get(contractYear) ?? 0
      if (inj > 0) {
        capital += inj
        injectedPrincipal += inj
        balanceAtYearStart += inj
      }
      if (wd > 0) {
        const actualWithdrawal = Math.min(wd, capital)
        capital -= actualWithdrawal
        balanceAtYearStart -= actualWithdrawal
      }
      if (cb > 0) {
        injectedPrincipal += cb
      }
    }

    const acquisitionCost = month <= acquisitionMonths ? monthlyAcquisitionCost : 0
    const contributionFee = monthlyProductContribution * input.fees.contributionFee
    const fixedFee = input.fees.fixedMonthlyFee
    const explicitFees = Math.min(
      monthlyProductContribution,
      contributionFee + fixedFee + acquisitionCost,
    )
    const investedContribution = Math.max(0, monthlyProductContribution - explicitFees)

    const capitalAfterGrowth = (capital + investedContribution) * (1 + currentMonthlyGrossRate)
    const assetFee = capitalAfterGrowth * (1 - monthlyRetentionFactor)
    capital = capitalAfterGrowth - assetFee

    const monthlyFees = explicitFees + assetFee
    totalUserCost += monthlyUserCost
    totalProductContributions += monthlyProductContribution
    totalEmployerContributions += monthlyEmployerContribution
    totalFees += monthlyFees
    feesInCurrentYear += monthlyFees
    contributionsInCurrentYear += monthlyProductContribution

    if (policy?.vorabpauschale) {
      const monthWithinYear = ((month - 1) % 12) + 1
      vpAcquisitionBaseInYear += (investedContribution * (13 - monthWithinYear)) / 12
    }

    if (month % 12 === 0 || month === input.months) {
      if (policy?.vorabpauschale) {
        const { rules, partialExemption, saverAllowanceOverride } = policy.vorabpauschale
        // Annual growth excludes contributions; transfer-event withdrawals
        // already reduced balanceAtYearStart at year-start (so the formula
        // stays correct with no extra adjustment for withdrawals).
        const annualGrowth = capital - balanceAtYearStart - contributionsInCurrentYear
        const basisertrag =
          (balanceAtYearStart + vpAcquisitionBaseInYear) * rules.capitalGains.basiszins * 0.7
        const vp = Math.max(0, Math.min(basisertrag, annualGrowth))
        const yearIndex = Math.floor((month - 1) / 12)
        const allowance = saverAllowanceOverride
          ? saverAllowanceOverride(yearIndex)
          : rules.capitalGains.saverAllowance
        const vpTax = calculateCapitalGainsTax(
          vp,
          rules,
          partialExemption,
          allowance,
        )
        capital -= vpTax
        cumulativeVorabpauschale += vp
      }

      const year = Math.ceil(month / 12)
      rows.push({
        year,
        age: input.currentAge + year,
        productId: input.productId,
        scenarioId: input.scenario.id,
        balance: capital,
        realBalance: capital / Math.pow(1 + input.inflationRate, year),
        yearlyUserCost: monthlyUserCost * 12,
        yearlyProductContribution: monthlyProductContribution * 12,
        yearlyEmployerContribution: monthlyEmployerContribution * 12,
        yearlyFees: feesInCurrentYear,
        cumulativeFees: totalFees,
        cumulativeProductContributions: totalProductContributions,
        cumulativeVorabpauschale,
      })
      balanceAtYearStart = capital
      feesInCurrentYear = 0
      contributionsInCurrentYear = 0
      vpAcquisitionBaseInYear = 0
    }
  }

  return {
    capital,
    realCapital: capital / Math.pow(1 + input.inflationRate, input.months / 12),
    totalUserCost,
    totalProductContributions,
    totalEmployerContributions,
    totalFees,
    // Cost-basis tracker: user-paid contributions plus injectedPrincipal from
    // inbound transfer events. ETF / pAV exit-tax helpers consume this as the
    // already-taxed basis to subtract from the gain. For a vanilla product
    // with no transfers it equals totalProductContributions (oracle-stable).
    totalContributionsBeforeFees: totalProductContributions + injectedPrincipal,
    cumulativeVorabpauschale,
    rows,
  }
}
