import type { InstanceCommon, InsuranceInstance } from '../domain/instances'
import type { GermanRules, InsuranceTaxMode, PersonalProfile, ProductId } from '../domain'
import { resolveInputStatus } from '../domain/inputStatus'
import { deriveInsuranceTaxMode } from './insurancePayout'

/** Readiness for hypothetical capital liquidation, independent of monthly mode. */
export function capitalTaxReadinessForInstance(
  productId: ProductId,
  instance: InstanceCommon & Partial<Pick<InsuranceInstance, 'oldContractTaxFreeEligible'>>,
  profile: Pick<PersonalProfile, 'age' | 'retirementAge'> | undefined,
  rules: Pick<GermanRules, 'year'>,
  classifiedInsuranceTaxMode?: InsuranceTaxMode,
): { canShowAfterTaxCapital: boolean; missingFields: string[] } {
  const unknown = (key: string) => resolveInputStatus(instance.inputStatus, instance.evidenceMap?.[key], key) === 'unknown'
  if (unknown('currentValueEUR')) return { canShowAfterTaxCapital: false, missingFields: ['currentValueEUR'] }
  // Opening zero needs no historical principal: future contributions have their own basis.
  if ((instance.currentValueEUR ?? 0) <= 0) return { canShowAfterTaxCapital: true, missingFields: [] }
  let required: string[] = []
  if (productId === 'etf') required = ['historicalCostBasisEUR', 'historicalVorabpauschaleEUR']
  if (productId === 'versicherung') {
    const payoutYear = profile ? rules.year + profile.retirementAge - profile.age : undefined
    const mode = classifiedInsuranceTaxMode ?? (profile && payoutYear !== undefined
      ? deriveInsuranceTaxMode(instance.contractStartYear, payoutYear - instance.contractStartYear,
        profile.retirementAge, instance.oldContractTaxFreeEligible) : undefined)
    if (mode === undefined) return { canShowAfterTaxCapital: false, missingFields: ['insuranceTaxMode'] }
    if (mode !== 'pre2005') required = ['historicalCostBasisEUR']
  }
  const missingFields = required.filter((key) => instance[key as keyof InstanceCommon] === undefined || unknown(key))
  return { canShowAfterTaxCapital: missingFields.length === 0, missingFields }
}
