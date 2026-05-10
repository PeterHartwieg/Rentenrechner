// Pure derivations for combine-mode CSV export wiring.
//
// Extracted from Calculator.tsx so the Calculator-built bundle ↔ CSV flow
// can be regression-tested without React rendering. Specifically: every
// instance the workspace contains must end up as a key in the returned
// `perInstanceTaxModes` record, otherwise the outer guard in
// `buildCombinePortfolioCsv` will skip Section 3 after-tax columns for that
// product (PR #193 — issue #86 follow-up).

import type { PersonalProfile } from '../domain'
import type { WorkspaceAssumptionsV2 } from '../domain/workspace'
import { deriveBavLumpSumTaxMode } from '../engine/bavPayout'
import { computeRuntimeYearsAtRetirement, deriveInsuranceTaxMode } from '../engine/insurancePayout'
import { de2026Rules } from '../rules/de2026'
import type { InstanceTaxModes } from '../utils/csvExport'

export function deriveCombinePerInstanceTaxModes(
  wa: WorkspaceAssumptionsV2,
  profile: Pick<PersonalProfile, 'age' | 'retirementAge'>,
): Record<string, InstanceTaxModes> {
  const perInstanceTaxModes: Record<string, InstanceTaxModes> = {}
  for (const inst of wa.bav) {
    perInstanceTaxModes[inst.instanceId] = {
      bavTaxMode: deriveBavLumpSumTaxMode(inst.durchfuehrungsweg, inst.pre2005EligibleTaxFree),
    }
  }
  for (const inst of wa.insurance) {
    const runtimeYears = computeRuntimeYearsAtRetirement(
      inst.contractStartYear,
      de2026Rules.year,
      profile.age,
      profile.retirementAge,
    )
    perInstanceTaxModes[inst.instanceId] = {
      insuranceTaxMode: deriveInsuranceTaxMode(
        inst.contractStartYear,
        runtimeYears,
        profile.retirementAge,
        inst.oldContractTaxFreeEligible,
      ),
    }
  }
  for (const inst of wa.etf) {
    perInstanceTaxModes[inst.instanceId] = {
      equityPartialExemption: inst.equityPartialExemption,
    }
  }
  for (const inst of wa.altersvorsorgedepot) {
    perInstanceTaxModes[inst.instanceId] = {
      avdOtherAnnualIncome: inst.monthlyOtherRetirementIncome * 12,
    }
  }
  for (const inst of wa.riester) {
    perInstanceTaxModes[inst.instanceId] = {
      riesterOtherAnnualIncome: inst.monthlyOtherRetirementIncome * 12,
    }
  }
  return perInstanceTaxModes
}
