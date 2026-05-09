// Pure, framework-agnostic selectors — re-export barrel.
//
// The implementation has moved to `src/utils/simulationSelectors.ts` so that
// engine and API modules can import from it without creating an upward
// `engine → app` dependency. This barrel keeps backward-compat for all
// existing `src/app/` callers.

export {
  resolveEffectiveScenarioId,
  deriveSelectedResults,
  deriveVisibleProducts,
  buildCapitalChartData,
  buildPensionBars,
  deriveComparableCapitalResults,
  deriveBestCapital,
  deriveBestPension,
  deriveCashflowBinding,
  deriveTaxModes,
  makeRowAfterTaxBalance,
  RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO,
  resolveTargetMonthlyRetirementIncome,
  deriveRentenluckeOverview,
  deriveRentenluckeOverviewFromCombine,
  type TaxModeContext,
  type CashflowAfterTaxInput,
  type RentenluckeOverview,
} from '../utils/simulationSelectors'
