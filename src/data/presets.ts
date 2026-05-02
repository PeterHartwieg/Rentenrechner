/**
 * #16 Scenario presets — one-click assumption templates.
 *
 * Each preset replaces the entire ScenarioAssumptions (not the personal profile).
 * Return scenarios (konservativ/basis/optimistisch) are preserved as-is from defaultAssumptions
 * so the presets stay consistent with whatever the user may have customised there.
 *
 * Sources for fee values: BAV_RESEARCH.md and PRIVATE_RENTENVERSICHERUNG_RESEARCH.md.
 */

import { defaultAssumptions } from './defaultScenario'
import type { ScenarioAssumptions } from '../domain'

export interface ScenarioPreset {
  id: string
  label: string
  description: string
  assumptions: ScenarioAssumptions
}

// ---------------------------------------------------------------------------
// Shared fee building blocks
// ---------------------------------------------------------------------------

const FEE_BASE = { acquisitionCostSpreadYears: 5 as const }

const ETF_NETTOTARIF_INSURANCE_FEES = {
  wrapperAssetFee: 0.004,   // 0.40 % wrapper — digital/neo insurer
  fundAssetFee: 0.002,      // 0.20 % fund TER — total 0.60 %
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  pensionPayoutFeePct: 0,
  ...FEE_BASE,
}

const BAV_STANDARD_FEES = {
  wrapperAssetFee: 0.006,   // 0.60 % wrapper
  fundAssetFee: 0.002,      // 0.20 % fund — total 0.80 %
  contributionFee: 0.045,   // 4.5 % per contribution
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0.025,
  pensionPayoutFeePct: 0.0175,
  ...FEE_BASE,
}

const PAV_HIGHCOST_FEES = {
  wrapperAssetFee: 0.008,   // 0.80 % wrapper
  fundAssetFee: 0.0025,     // 0.25 % fund — total 1.05 %
  contributionFee: 0.09,    // 9 % per contribution — typical classic provisioned tariff
  fixedMonthlyFee: 5,
  acquisitionCostPct: 0.04, // 4 % of total contributions
  pensionPayoutFeePct: 0.0175,
  ...FEE_BASE,
}

const PAV_ALTVERTRAG_FEES = {
  wrapperAssetFee: 0.012,   // 1.20 % wrapper
  fundAssetFee: 0.002,      // 0.20 % fund — total 1.40 %
  contributionFee: 0.03,
  fixedMonthlyFee: 5,
  acquisitionCostPct: 0.025,
  pensionPayoutFeePct: 0,
  ...FEE_BASE,
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'etf_nettotarif',
    label: 'ETF Nettotarif',
    description:
      'Günstigstes ETF-Depot als Hauptsparweg. Minimale Kosten über alle Produkte — zeigt den Basisfall ohne Arbeitgeber-Extras.',
    assumptions: {
      ...defaultAssumptions,
      etf: { annualAssetFee: 0.002, equityPartialExemption: 0.3, annualContributionGrowthRate: 0 },
      bav: {
        ...defaultAssumptions.bav,
        monthlyGrossConversion: 300,
        statutoryMinimumSubsidyEnabled: true,
        contractualMatchPercent: 0,
        contractualFixedMonthly: 0,
        fees: {
          wrapperAssetFee: 0.003,
          fundAssetFee: 0.002,
          contributionFee: 0.03,
          fixedMonthlyFee: 0,
          acquisitionCostPct: 0.025,
          pensionPayoutFeePct: 0,
          ...FEE_BASE,
        },
      },
      insurance: {
        ...defaultAssumptions.insurance,
        contractStartYear: 2024,
        oldContractTaxFreeEligible: false,
        paidUpAge: undefined,
        surrenderHaircutPct: 0,
        fees: ETF_NETTOTARIF_INSURANCE_FEES,
      },
    },
  },
  {
    id: 'bav_standard',
    label: 'bAV Standard',
    description:
      'Klassische Entgeltumwandlung mit gesetzlichem AG-Mindestzuschuss (§1a Abs. 1a BetrAVG) und typischen Marktkosten. Kein vertraglicher AG-Zuschuss.',
    assumptions: {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        monthlyGrossConversion: 300,
        statutoryMinimumSubsidyEnabled: true,
        contractualMatchPercent: 0,
        contractualFixedMonthly: 0,
        durchfuehrungsweg: 'direktversicherung_3_63',
        pre2005EligibleTaxFree: false,
        fees: BAV_STANDARD_FEES,
      },
    },
  },
  {
    id: 'bav_ag_match_50',
    label: 'bAV AG-Match 50 %',
    description:
      'Großzügiger Arbeitgeber zahlt 50 % der Entgeltumwandlung obendrauf. Typisch bei Tarifverträgen oder freiwilligen AG-Programmen — erhöht die bAV-Rendite deutlich.',
    assumptions: {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        monthlyGrossConversion: 300,
        statutoryMinimumSubsidyEnabled: true,
        contractualMatchPercent: 0.5,
        contractualFixedMonthly: 0,
        durchfuehrungsweg: 'direktversicherung_3_63',
        pre2005EligibleTaxFree: false,
        fees: BAV_STANDARD_FEES,
      },
    },
  },
  {
    id: 'pav_hochkosten',
    label: 'pAV Hochkosten',
    description:
      'Traditioneller Hochkostenvertrag mit hohen Abschluss- und Verwaltungsgebühren — typisch für klassisch provisionierte Tarife ab ca. 2010.',
    assumptions: {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        contractStartYear: 2020,
        oldContractTaxFreeEligible: false,
        paidUpAge: undefined,
        surrenderHaircutPct: 0.05,
        fees: PAV_HIGHCOST_FEES,
      },
    },
  },
  {
    id: 'pav_altvertrag',
    label: 'pAV Altvertrag',
    description:
      'Vor 2005 abgeschlossener Vertrag mit Kapitalwahlrecht steuerfrei nach §52 Abs. 28 EStG a.F. (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre).',
    assumptions: {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        contractStartYear: 2000,
        oldContractTaxFreeEligible: true,
        paidUpAge: undefined,
        surrenderHaircutPct: 0,
        fees: PAV_ALTVERTRAG_FEES,
      },
    },
  },
]
