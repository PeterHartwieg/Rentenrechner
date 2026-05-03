import { describe, expect, it, vi } from 'vitest'
import type { ProductResult } from '../domain'
import type { Workspace } from '../domain/workspace'
import type { BavInstance, BasisrenteInstance, RiesterInstance, AltersvorsorgedepotInstance, EtfInstance, InsuranceInstance } from '../domain/instances'
import {
  runRules,
  renderAtom,
  ctxNumber,
  type Atom,
  type AtomId,
  type RuleEngineInput,
} from './recommendations'
import { productReason, sensitivityHint } from '../features/results/decisionLogic'
import { de2026Rules } from '../rules/de2026'

// ---------------------------------------------------------------------------
// Minimal factories
// ---------------------------------------------------------------------------

function makeInput(products: ProductResult[]): RuleEngineInput {
  return { simulationResult: { products } }
}

function makeResult(overrides: Partial<ProductResult>): ProductResult {
  return {
    productId: 'etf',
    label: 'ETF-Depot',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 100,
    monthlyProductContribution: 100,
    monthlyEmployerContribution: 0,
    totalUserCost: 12000,
    totalProductContributions: 12000,
    totalEmployerContributions: 0,
    totalFees: 100,
    capitalAtRetirement: 25000,
    realCapitalAtRetirement: 20000,
    afterTaxLumpSum: 22000,
    grossMonthlyPayout: 100,
    netMonthlyPayout: 80,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 1.8,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.003,
    rows: [],
    etfPayoutRows: [],
    ...overrides,
  } as ProductResult
}

// ---------------------------------------------------------------------------
// Engine basics
// ---------------------------------------------------------------------------

describe('runRules', () => {
  it('returns [] when rules array is empty', () => {
    const input = makeInput([])
    expect(runRules(input, [])).toEqual([])
  })

  it('does not throw on empty products array', () => {
    const input = makeInput([])
    expect(() => runRules(input)).not.toThrow()
  })

  it('returns an array with at least one atom when products are present', () => {
    const input = makeInput([makeResult({})])
    expect(runRules(input).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// renderAtom
// ---------------------------------------------------------------------------

describe('renderAtom', () => {
  it('returns headline and body for a known id', () => {
    const atom: Atom = {
      id: 'reason_low_fees',
      priority: 'medium',
      context: { productId: 'etf', label: 'ETF', riyDecimal: 0.003 },
    }
    const rendered = renderAtom(atom)
    expect(rendered.headline).toBeTruthy()
    expect(rendered.body).toBeTruthy()
  })

  it('returns empty-string fallback for an unknown id — does not throw', () => {
    const atom = {
      id: 'completely_unknown_atom_id' as AtomId,
      priority: 'low' as const,
      context: {},
    }
    expect(() => renderAtom(atom)).not.toThrow()
    const rendered = renderAtom(atom)
    expect(rendered.headline).toBe('')
    expect(rendered.body).toBe('')
  })

  it('logs a warning in dev mode for an unknown id', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const atom = {
      id: 'unknown_for_warn_test' as AtomId,
      priority: 'low' as const,
      context: {},
    }
    renderAtom(atom)
    // import.meta.env?.DEV is true in vitest
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown_for_warn_test'),
    )
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// renderAtom snapshots — lock the current copy for all known atom ids
// ---------------------------------------------------------------------------

describe('renderAtom snapshots', () => {
  const knownAtoms: Atom[] = [
    {
      id: 'sensitivity_rankings_disagree',
      priority: 'high',
      context: { bestCapitalId: 'etf', bestCapitalLabel: 'ETF', bestPensionId: 'bav', bestPensionLabel: 'bAV' },
    },
    {
      id: 'sensitivity_narrow_capital_gap',
      priority: 'medium',
      context: { winnerId: 'etf', winnerLabel: 'ETF', runnerId: 'bav', runnerLabel: 'bAV', gapPct: 0.03 },
    },
    {
      id: 'sensitivity_high_fee_winner',
      priority: 'medium',
      context: { winnerId: 'versicherung', winnerLabel: 'pAV', riyDecimal: 0.016 },
    },
    {
      id: 'sensitivity_default',
      priority: 'low',
      context: { text: 'Wähle weitere Produkte aus, um Vergleichshinweise zu sehen.' },
    },
    {
      id: 'reason_employer_subsidy',
      priority: 'high',
      context: { productId: 'bav', label: 'bAV', employerSharePct: 0.3 },
    },
    {
      id: 'reason_low_fees',
      priority: 'medium',
      context: { productId: 'etf', label: 'ETF', riyDecimal: 0.003 },
    },
    {
      id: 'reason_high_fees',
      priority: 'high',
      context: { productId: 'bav', label: 'bAV', riyDecimal: 0.016 },
    },
    {
      id: 'reason_high_fees',
      priority: 'high',
      context: { productId: 'versicherung', label: 'pAV', riyDecimal: 0.016 },
    },
    {
      id: 'reason_high_fees',
      priority: 'high',
      context: { productId: 'basisrente', label: 'Basisrente', riyDecimal: 0.016 },
    },
    {
      id: 'reason_tax_deferral',
      priority: 'medium',
      context: { productId: 'bav', label: 'bAV' },
    },
    {
      id: 'reason_tax_deferral',
      priority: 'medium',
      context: { productId: 'basisrente', label: 'Basisrente' },
    },
    {
      id: 'reason_flexible_capital',
      priority: 'low',
      context: { productId: 'etf', label: 'ETF', riyDecimal: 0.015 },
    },
    {
      id: 'reason_subsidies',
      priority: 'medium',
      context: { productId: 'altersvorsorgedepot', label: 'AVD' },
    },
    {
      id: 'reason_subsidies',
      priority: 'medium',
      context: { productId: 'riester', label: 'Riester' },
    },
    {
      id: 'reason_subsidies',
      priority: 'medium',
      context: { productId: 'riester', label: 'Riester', hasEmployerContribution: true },
    },
    {
      id: 'reason_guarantee',
      priority: 'medium',
      context: { productId: 'versicherung', label: 'pAV' },
    },
  ]

  it('renderAtom output matches snapshot for all known ids', () => {
    const snapshot = knownAtoms.map((a) => ({ id: a.id, context: a.context, rendered: renderAtom(a) }))
    expect(snapshot).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Re-expressed rules produce the same atom counts and kinds as decisionLogic
// ---------------------------------------------------------------------------

describe('re-expressed rules vs decisionLogic', () => {
  const products = [
    makeResult({ productId: 'etf', label: 'ETF', accumulationRiy: 0.003, afterTaxLumpSum: 100_000, netMonthlyPayout: 900 }),
    makeResult({ productId: 'bav', label: 'bAV', accumulationRiy: 0.005, afterTaxLumpSum: 80_000, netMonthlyPayout: 700, totalProductContributions: 10_000, totalEmployerContributions: 500 }),
  ]

  it('emits one sensitivity atom + one reason atom per product', () => {
    const atoms = runRules(makeInput(products))
    // 1 sensitivity + 2 reason atoms
    expect(atoms).toHaveLength(3)
  })

  it('reason atom ids match productReason kinds from decisionLogic', () => {
    for (const result of products) {
      const atoms = runRules(makeInput([result]))
      const reasonAtom = atoms.find((a) => a.id.startsWith('reason_'))
      expect(reasonAtom).toBeDefined()
      const legacyReason = productReason(result)
      // The atom id should encode the same kind as the legacy facade returns.
      expect(reasonAtom?.id).toBe(`reason_${legacyReason.kind}`)
    }
  })

  it('sensitivity atom kind matches sensitivityHint kind from decisionLogic', () => {
    const hint = sensitivityHint(products)
    const atoms = runRules(makeInput(products))
    const sensitivityAtom = atoms.find((a) => a.id.startsWith('sensitivity_'))
    expect(sensitivityAtom).toBeDefined()
    expect(sensitivityAtom?.id).toBe(`sensitivity_${hint.kind}`)
  })

  it('rankings_disagree fires when capital and pension winners differ', () => {
    const etf = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 100_000, netMonthlyPayout: 600 })
    const bav = makeResult({ productId: 'bav', label: 'bAV', afterTaxLumpSum: 80_000, netMonthlyPayout: 900 })
    const atoms = runRules(makeInput([etf, bav]))
    expect(atoms.some((a) => a.id === 'sensitivity_rankings_disagree')).toBe(true)
  })

  it('narrow_capital_gap fires when winner is within 5 % of runner-up', () => {
    const etf = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 100_000, netMonthlyPayout: 900 })
    const bav = makeResult({ productId: 'bav', label: 'bAV', afterTaxLumpSum: 98_000, netMonthlyPayout: 800 })
    const atoms = runRules(makeInput([etf, bav]))
    expect(atoms.some((a) => a.id === 'sensitivity_narrow_capital_gap')).toBe(true)
  })

  it('high_fee_winner fires when winner has high RIY and clear lead', () => {
    const ins = makeResult({ productId: 'versicherung', label: 'pAV', afterTaxLumpSum: 100_000, netMonthlyPayout: 900, accumulationRiy: 0.016 })
    const etf = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 80_000, netMonthlyPayout: 700, accumulationRiy: 0.003 })
    const atoms = runRules(makeInput([ins, etf]))
    expect(atoms.some((a) => a.id === 'sensitivity_high_fee_winner')).toBe(true)
  })

  it('default sensitivity fires when no special condition applies', () => {
    const a = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 100_000, netMonthlyPayout: 900, accumulationRiy: 0.003 })
    const b = makeResult({ productId: 'bav', label: 'bAV', afterTaxLumpSum: 80_000, netMonthlyPayout: 700, accumulationRiy: 0.005 })
    const atoms = runRules(makeInput([a, b]))
    expect(atoms.some((a) => a.id === 'sensitivity_default')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cap and headroom rule fixtures (issue 11)
// ---------------------------------------------------------------------------

// bAV §3 Nr. 63 annual cap for 2026: 101,400 × 0.08 = 8,112 EUR/year = 676 EUR/month
const BAV_CAP_MONTHLY = (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12

const INSTANCE_COMMON = {
  label: 'Test',
  status: 'active' as const,
  contractStartYear: 2020,
  evidenceMap: {},
}

const NEUTRALISED_FEES = {
  wrapperAssetFee: 0,
  fundAssetFee: 0.002,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

function makeBavInstance(overrides: Partial<BavInstance> = {}): BavInstance {
  return {
    instanceId: 'bav-1',
    ...INSTANCE_COMMON,
    monthlyGrossConversion: 200,
    statutoryMinimumSubsidyEnabled: true,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    fees: NEUTRALISED_FEES,
    monthlyOtherRetirementIncome: 0,
    includeGrvReduction: false,
    kvdrMember: true,
    durchfuehrungsweg: 'direktversicherung_3_63',
    pre2005EligibleTaxFree: false,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    annualContributionGrowthRate: 0,
    ...overrides,
  } as BavInstance
}

function makeBasisrenteInstance(overrides: Partial<BasisrenteInstance> = {}): BasisrenteInstance {
  return {
    instanceId: 'basisrente-1',
    ...INSTANCE_COMMON,
    monthlyGrossContribution: 0,
    fees: NEUTRALISED_FEES,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    ...overrides,
  } as BasisrenteInstance
}

function makeRiesterInstance(overrides: Partial<RiesterInstance> = {}): RiesterInstance {
  return {
    instanceId: 'riester-1',
    ...INSTANCE_COMMON,
    monthlyOwnContribution: 0,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 28,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: NEUTRALISED_FEES,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
    ...overrides,
  } as RiesterInstance
}

function makeAvdInstance(overrides: Partial<AltersvorsorgedepotInstance> = {}): AltersvorsorgedepotInstance {
  return {
    instanceId: 'avd-1',
    ...INSTANCE_COMMON,
    subtype: 'standarddepot',
    monthlyOwnContribution: 0,
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      eligibleChildren: 0,
      ageAtContractStart: 28,
      careerStarterBonusUsed: false,
    },
    riskAllocationPct: 0.8,
    riskAnnualReturn: 0.05,
    lowRiskAnnualReturn: 0.02,
    fees: NEUTRALISED_FEES,
    payoutMode: 'certified_payout_plan',
    payoutPlanEndAge: 85,
    partialCapitalPct: 0,
    transferCostEUR: 0,
    riesterTransferCapital: 0,
    monthlyOtherRetirementIncome: 0,
    rentenfaktor: 28,
    ...overrides,
  } as AltersvorsorgedepotInstance
}

/** Minimal stub workspace for rules that need combinedResult + workspace */
function makeWorkspace(overrides: {
  bav?: BavInstance[]
  basisrente?: BasisrenteInstance[]
  riester?: RiesterInstance[]
  altersvorsorgedepot?: AltersvorsorgedepotInstance[]
  etf?: EtfInstance[]
  grossSalaryYear?: number
  hasPartner?: boolean
}): Workspace {
  const {
    bav = [],
    basisrente = [],
    riester = [],
    altersvorsorgedepot = [],
    etf = [],
    grossSalaryYear = 75_000,
    hasPartner = false,
  } = overrides

  const partnerProfile = hasPartner
    ? {
        age: 34,
        retirementAge: 67,
        grossSalaryYear: 50_000,
        taxClass: 1 as const,
        childBirthYears: [],
        churchTax: false,
        publicHealthInsurance: true,
        healthAdditionalContributionPct: 2.9,
        pkvMonthlyPremium: 0,
        pPVMonthlyPremium: 0,
        desiredNetMonthlyPension: 0,
      }
    : undefined

  return {
    schemaVersion: 2,
    mode: 'combine',
    baseline: {
      id: 'baseline',
      label: 'Basis',
      profile: {
        age: 35,
        retirementAge: 67,
        grossSalaryYear,
        taxClass: 1 as const,
        childBirthYears: [],
        churchTax: false,
        publicHealthInsurance: true,
        healthAdditionalContributionPct: 2.9,
        pkvMonthlyPremium: 0,
        pPVMonthlyPremium: 0,
        desiredNetMonthlyPension: 0,
      },
      partner: partnerProfile,
      assumptions: {
        bav,
        etf,
        insurance: [] as InsuranceInstance[],
        basisrente,
        altersvorsorgedepot,
        riester,
        statutoryPension: {
          pensionBaselineType: 'grv' as const,
          manualMonthlyGross: null,
          currentEntgeltpunkte: 20,
          includeGrvReduction: false,
        },
        inflationRate: 0.02,
        retirementEndAge: 90,
        returnScenarios: [{ id: 'basis' as const, label: 'Basis', annualReturn: 0.05 }],
        monteCarlo: { enabled: false, runs: 500, annualVolatility: 0.15, seed: 42 },
        visibleProducts: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      origin: 'baseline' as const,
    },
    whatIfs: [],
    pinnedComparisonIds: [],
  }
}

/** Minimal combinedResult stub — rules only check for its presence */
const STUB_COMBINED_RESULT = { monthlyNetIncome: 1_000 } as import('../engine/portfolioCombine').CombinedResult

function makeCapInput(
  workspaceOverrides: Parameters<typeof makeWorkspace>[0],
  products: ProductResult[] = [],
): RuleEngineInput {
  return {
    workspace: makeWorkspace(workspaceOverrides),
    simulationResult: { products },
    combinedResult: STUB_COMBINED_RESULT,
    rules: de2026Rules,
  }
}

// ---------------------------------------------------------------------------
// bav_cap_remaining
// ---------------------------------------------------------------------------

describe('bav_cap_remaining rule', () => {
  it('returns null when combinedResult is absent (compare-mode)', () => {
    const input: RuleEngineInput = {
      simulationResult: { products: [] },
    }
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_cap_remaining')).toBe(false)
  })

  it('empty workspace → usedPct: 0, remainingMonthly = cap / 12', () => {
    const input = makeCapInput({})
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'bav_cap_remaining')
    expect(atom).toBeDefined()
    expect(ctxNumber(atom!.context, 'usedPct')).toBe(0)
    expect(ctxNumber(atom!.context, 'remainingMonthly')).toBeCloseTo(BAV_CAP_MONTHLY, 2)
    expect(atom!.priority).toBe('medium')
    expect(atom!.context['nextLeverProductId']).toBeUndefined()
  })

  it('Bernd-shape: usedPct ≈ 0.65 when monthly gross ≈ 65% of cap', () => {
    // BAV_CAP_MONTHLY = 676. 440/676 ≈ 0.651
    const bavInst = makeBavInstance({ instanceId: 'bav-bernd', monthlyGrossConversion: 440 })
    const input = makeCapInput({ bav: [bavInst] })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'bav_cap_remaining')!
    expect(atom).toBeDefined()
    const usedPct = ctxNumber(atom.context, 'usedPct')
    expect(usedPct).toBeGreaterThan(0.64)
    expect(usedPct).toBeLessThan(0.67)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(BAV_CAP_MONTHLY - 440, 2)
    expect(atom.priority).toBe('medium')
  })

  it('Jens-shape: usedPct: 1.0 when at cap, nextLeverProductId set, priority high', () => {
    const bavInst = makeBavInstance({ instanceId: 'bav-jens', monthlyGrossConversion: BAV_CAP_MONTHLY })
    const input = makeCapInput({ bav: [bavInst] })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'bav_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(0, 2)
    expect(atom.context['nextLeverProductId']).toBe('basisrente')
    expect(atom.priority).toBe('high')
  })

  it('over-cap clamps usedPct to 1.0', () => {
    const bavInst = makeBavInstance({ monthlyGrossConversion: BAV_CAP_MONTHLY * 2 })
    const input = makeCapInput({ bav: [bavInst] })
    const atom = runRules(input).find((a) => a.id === 'bav_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
  })

  it('surrendered instances are excluded', () => {
    const active = makeBavInstance({ instanceId: 'bav-active', monthlyGrossConversion: 200 })
    const surrendered = makeBavInstance({ instanceId: 'bav-gone', status: 'surrendered', monthlyGrossConversion: 800 })
    const input = makeCapInput({ bav: [active, surrendered] })
    const atom = runRules(input).find((a) => a.id === 'bav_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBeCloseTo(200 * 12 / (BAV_CAP_MONTHLY * 12), 4)
  })

  it('single-instance and multi-instance with same total → identical usedPct', () => {
    const single = makeBavInstance({ instanceId: 'bav-s', monthlyGrossConversion: 300 })
    const multiA = makeBavInstance({ instanceId: 'bav-a', monthlyGrossConversion: 150 })
    const multiB = makeBavInstance({ instanceId: 'bav-b', monthlyGrossConversion: 150 })

    const inputSingle = makeCapInput({ bav: [single] })
    const inputMulti = makeCapInput({ bav: [multiA, multiB] })

    const atomSingle = runRules(inputSingle).find((a) => a.id === 'bav_cap_remaining')!
    const atomMulti = runRules(inputMulti).find((a) => a.id === 'bav_cap_remaining')!

    expect(ctxNumber(atomSingle.context, 'usedPct')).toBeCloseTo(ctxNumber(atomMulti.context, 'usedPct'), 6)
    expect(ctxNumber(atomSingle.context, 'remainingMonthly')).toBeCloseTo(
      ctxNumber(atomMulti.context, 'remainingMonthly'), 6,
    )
  })
})

// ---------------------------------------------------------------------------
// basisrente_cap_remaining
// ---------------------------------------------------------------------------

describe('basisrente_cap_remaining rule', () => {
  it('returns null in compare-mode (no combinedResult)', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'basisrente_cap_remaining')).toBe(false)
  })

  it('empty workspace → usedPct includes pension contributions, no Basisrente own contributions', () => {
    const input = makeCapInput({ grossSalaryYear: 75_000 })
    const atom = runRules(input).find((a) => a.id === 'basisrente_cap_remaining')!
    expect(atom).toBeDefined()
    // usedPct > 0 because GRV contributions count toward the Schicht-1 cap
    expect(ctxNumber(atom.context, 'usedPct')).toBeGreaterThan(0)
    // No Basisrente contributions → remainingAnnual = schicht1Cap - grvContribs
    const schicht1Cap = de2026Rules.basisrente.schicht1CapSingle
    const pensionBase = Math.min(75_000, de2026Rules.socialSecurity.pensionCapYear)
    const grvTotal = pensionBase * (de2026Rules.socialSecurity.pensionEmployeeRate + de2026Rules.socialSecurity.pensionEmployerRate)
    const expected = Math.max(0, schicht1Cap - grvTotal)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBeCloseTo(expected, 1)
  })

  it('Jens-shape: basisrente at 0 while bAV full → usedPct reflects only GRV contributions', () => {
    const bavInst = makeBavInstance({ monthlyGrossConversion: BAV_CAP_MONTHLY })
    const basInst = makeBasisrenteInstance({ monthlyGrossContribution: 0 })
    const input = makeCapInput({ bav: [bavInst], basisrente: [basInst] })
    const atom = runRules(input).find((a) => a.id === 'basisrente_cap_remaining')!
    expect(atom).toBeDefined()
    // usedPct should not be 1 since Basisrente contributions are zero
    expect(ctxNumber(atom.context, 'usedPct')).toBeLessThan(1)
  })

  it('at schicht-1 cap → usedPct clamped at 1', () => {
    // Gross salary = 0 (no GRV contribution); Basisrente contribution fills the entire cap
    const basInst = makeBasisrenteInstance({
      monthlyGrossContribution: de2026Rules.basisrente.schicht1CapSingle / 12,
    })
    const input = makeCapInput({ grossSalaryYear: 0, basisrente: [basInst] })
    const atom = runRules(input).find((a) => a.id === 'basisrente_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// riester_cap_remaining
// ---------------------------------------------------------------------------

describe('riester_cap_remaining rule', () => {
  it('returns null in compare-mode', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'riester_cap_remaining')).toBe(false)
  })

  it('empty workspace (no Riester instances) → usedPct: 0, topUpToCap = cap', () => {
    const input = makeCapInput({})
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    expect(atom).toBeDefined()
    expect(ctxNumber(atom.context, 'usedPct')).toBe(0)
    expect(ctxNumber(atom.context, 'topUpToCap')).toBeCloseTo(de2026Rules.riester.annualCapInclAllowances, 2)
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(0)
  })

  it('Riester instance with direct eligibility: allowanceCovered includes Grundzulage', () => {
    const riesterInst = makeRiesterInstance({ monthlyOwnContribution: 100 })
    const input = makeCapInput({ riester: [riesterInst] })
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    // Directly eligible: allowanceCovered = grundzulage (175 EUR)
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(de2026Rules.riester.grundzulage)
    // own = 100×12 = 1200; allowance = 175; total = 1375; cap = 2100; topUp = 2100 - 1200 - 175 = 725
    expect(ctxNumber(atom.context, 'topUpToCap')).toBeCloseTo(
      de2026Rules.riester.annualCapInclAllowances - 100 * 12 - de2026Rules.riester.grundzulage, 1,
    )
  })

  it('at full cap → usedPct: 1, topUpToCap: 0, priority high', () => {
    const ownMonthly = (de2026Rules.riester.annualCapInclAllowances - de2026Rules.riester.grundzulage) / 12
    const riesterInst = makeRiesterInstance({ monthlyOwnContribution: ownMonthly })
    const input = makeCapInput({ riester: [riesterInst] })
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBeCloseTo(1, 4)
    expect(ctxNumber(atom.context, 'topUpToCap')).toBeCloseTo(0, 4)
    expect(atom.priority).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// avd_cap_remaining
// ---------------------------------------------------------------------------

describe('avd_cap_remaining rule', () => {
  it('returns null in compare-mode', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'avd_cap_remaining')).toBe(false)
  })

  it('empty workspace → usedPct: 0, remainingMonthly = cap / 12', () => {
    const input = makeCapInput({})
    const atom = runRules(input).find((a) => a.id === 'avd_cap_remaining')!
    expect(atom).toBeDefined()
    expect(ctxNumber(atom.context, 'usedPct')).toBe(0)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(
      de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12, 2,
    )
  })

  it('AVD instance with own contribution shows correct usedPct', () => {
    const avdInst = makeAvdInstance({ monthlyOwnContribution: 200 })
    const input = makeCapInput({ altersvorsorgedepot: [avdInst] })
    const atom = runRules(input).find((a) => a.id === 'avd_cap_remaining')!
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    expect(ctxNumber(atom.context, 'usedPct')).toBeCloseTo(200 / capMonthly, 4)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(capMonthly - 200, 2)
  })

  it('at cap → usedPct: 1, priority high', () => {
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    const avdInst = makeAvdInstance({ monthlyOwnContribution: capMonthly })
    const input = makeCapInput({ altersvorsorgedepot: [avdInst] })
    const atom = runRules(input).find((a) => a.id === 'avd_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
    expect(atom.priority).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// sparerpauschbetrag_remaining
// ---------------------------------------------------------------------------

describe('sparerpauschbetrag_remaining rule', () => {
  it('returns null in compare-mode', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'sparerpauschbetrag_remaining')).toBe(false)
  })

  it('empty workspace (no ETF/AVD products) → usedPct: 0, remainingAnnual = 1000 (single)', () => {
    const input = makeCapInput({})
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(atom).toBeDefined()
    expect(ctxNumber(atom.context, 'usedAnnual')).toBe(0)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance)
    expect(atom.context['married']).toBe(false)
  })

  it('married workspace → cap = 2000 EUR', () => {
    const input = makeCapInput({ hasPartner: true })
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(atom.context['married']).toBe(true)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance * 2)
  })

  it('ETF product with payout row uses saverAllowanceUsed', () => {
    const etfProduct = makeResult({
      productId: 'etf',
      label: 'ETF',
      etfPayoutRows: [
        {
          year: 1, age: 67, capitalAtStart: 200_000,
          grossAnnualPayout: 12_000, taxableGain: 5_000,
          saverAllowanceUsed: 800, taxDue: 1_050,
          netAnnualPayout: 10_950, netMonthlyPayout: 912.5,
          capitalAtEnd: 192_000, remainingCostBasis: 80_000,
        },
      ],
    })
    const input = makeCapInput({}, [etfProduct])
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(ctxNumber(atom.context, 'usedAnnual')).toBe(800)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance - 800)
  })

  it('ETF product with accumulation rows uses first-year cumulativeVorabpauschale', () => {
    const etfProduct = makeResult({
      productId: 'etf',
      label: 'ETF',
      etfPayoutRows: [],
      rows: [
        {
          year: 2026, age: 36, productId: 'etf', scenarioId: 'basis',
          balance: 50_000, realBalance: 45_000, yearlyUserCost: 2_400,
          yearlyProductContribution: 2_400, yearlyEmployerContribution: 0,
          yearlyFees: 100, cumulativeFees: 100, cumulativeProductContributions: 2_400,
          cumulativeVorabpauschale: 350,
        },
      ],
    })
    const input = makeCapInput({}, [etfProduct])
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(ctxNumber(atom.context, 'usedAnnual')).toBe(350)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance - 350)
  })
})

// ---------------------------------------------------------------------------
// renderAtom snapshots — extend for new cap atom IDs
// ---------------------------------------------------------------------------

describe('renderAtom snapshots — cap atoms', () => {
  const capAtoms: Atom[] = [
    {
      id: 'bav_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.65, remainingMonthly: 236, nextLeverProductId: undefined },
    },
    {
      id: 'bav_cap_remaining',
      priority: 'high',
      context: { usedPct: 1.0, remainingMonthly: 0, nextLeverProductId: 'basisrente' },
    },
    {
      id: 'basisrente_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.3, remainingAnnual: 15_000 },
    },
    {
      id: 'riester_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.5, allowanceCovered: 175, topUpToCap: 750 },
    },
    {
      id: 'riester_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0, allowanceCovered: 0, topUpToCap: 2_100 },
    },
    {
      id: 'avd_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.35, remainingMonthly: 370 },
    },
    {
      id: 'sparerpauschbetrag_remaining',
      priority: 'medium',
      context: { usedAnnual: 0, remainingAnnual: 1_000, married: false },
    },
    {
      id: 'sparerpauschbetrag_remaining',
      priority: 'medium',
      context: { usedAnnual: 400, remainingAnnual: 1_600, married: true },
    },
  ]

  it('renderAtom output matches snapshot for cap atom ids', () => {
    const snapshot = capAtoms.map((a) => ({ id: a.id, context: a.context, rendered: renderAtom(a) }))
    expect(snapshot).toMatchSnapshot()
  })
})
