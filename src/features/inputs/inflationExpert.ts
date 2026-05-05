import { DEFAULT_EXPERT_INFLATION_RATE } from '../../data/defaultScenario'

export function nextInflationRateForExpertToggle(
  enabled: boolean,
  currentRate: number,
  rememberedExpertRate?: number,
): number {
  if (!enabled) return 0
  return Number.isFinite(currentRate) && currentRate > 0
    ? currentRate
    : Number.isFinite(rememberedExpertRate) && rememberedExpertRate !== undefined && rememberedExpertRate > 0
      ? rememberedExpertRate
      : DEFAULT_EXPERT_INFLATION_RATE
}
