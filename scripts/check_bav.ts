/**
 * Audit script: bAV lump-sum tax + KV/PV breakdown for the default scenario.
 *
 * Purpose: when the headline `nach Steuer-Lump` figure looks suspicious, this
 * script reproduces the engine's lump-sum calculation step-by-step so you can
 * verify income tax (marginal-rate via calculateRetirementTax) and KV/PV
 * (1/120 spreading via calculateRetirementKvPv) against the actual snapshot.
 *
 * Defaults reflect a §3 Nr. 63 Direktversicherung (voll_versorgungsbezug,
 * no Fünftelregelung per BFH X R 25/23). Edit the imports below to audit
 * other Durchführungswege or profiles.
 *
 * Run: npm run check:bav
 */
import { simulateRetirementComparison } from '../src/engine/simulate'
import { defaultProfile, defaultAssumptions } from '../src/data/defaultScenario'
import { calculateRetirementTax, calculateRetirementKvPv } from '../src/engine/retirementTax'
import { activeRules } from '../src/rules'
import { careEmployeeRateForChildren } from '../src/engine/salary'

const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, activeRules)
const basis = result.products.find(p => p.productId === 'bav' && p.scenarioId === 'basis')
if (!basis) throw new Error('bAV basis scenario not found')
console.log('--- BAV BASIS ---')
console.log('capital:', basis.capitalAtRetirement.toFixed(2))
console.log('afterTaxLumpSum:', basis.afterTaxLumpSum.toFixed(2))
if (basis.lumpSumDeductions) {
  console.log('  → engine breakdown:',
    'incomeTax', basis.lumpSumDeductions.incomeTax.toFixed(0),
    '+ kvPv', basis.lumpSumDeductions.kvPv.toFixed(0))
}

const grvMonthly = result.statutoryPension.grossMonthlyPension
const grvAnnual = grvMonthly * 12
const lumpSum = basis.capitalAtRetirement
const retirementYear = activeRules.year + (defaultProfile.retirementAge - defaultProfile.age)
console.log('GRV monthly:', grvMonthly.toFixed(2), 'annual:', grvAnnual.toFixed(0))
console.log('retirementYear:', retirementYear)

const taxWith = calculateRetirementTax({
  statutoryPensionAnnual: grvAnnual,
  bavPensionAnnual: lumpSum,
  bavIsLumpSum: true,
  privateInsuranceTaxableAnnual: 0,
  privateInsuranceTaxMode: 'abgeltungsteuer',
  otherTaxableAnnual: 0,
  retirementYear,
}, activeRules, 'single')
const taxWithout = calculateRetirementTax({
  statutoryPensionAnnual: grvAnnual,
  bavPensionAnnual: 0,
  bavIsLumpSum: true,
  privateInsuranceTaxableAnnual: 0,
  privateInsuranceTaxMode: 'abgeltungsteuer',
  otherTaxableAnnual: 0,
  retirementYear,
}, activeRules, 'single')
console.log('--- INCOME TAX ---')
console.log('zvE with:', taxWith.zuVersteuerndesEinkommen.toFixed(0))
console.log('zvE without:', taxWithout.zuVersteuerndesEinkommen.toFixed(0))
console.log('ESt with:', taxWith.einkommensteuer.toFixed(0), 'without:', taxWithout.einkommensteuer.toFixed(0))
console.log('Soli with:', taxWith.solidaritaetszuschlag.toFixed(0), 'without:', taxWithout.solidaritaetszuschlag.toFixed(0))
const incomeTaxOnLump = taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual
console.log('marginal tax on lump:', incomeTaxOnLump.toFixed(0), '=', (incomeTaxOnLump/lumpSum*100).toFixed(1)+'%')

const monthlyBase = lumpSum / 120
const additionalHealthRate = defaultProfile.healthAdditionalContributionPct / 100
const healthRate = activeRules.socialSecurity.healthGeneralRate + additionalHealthRate
const careRate = careEmployeeRateForChildren(defaultProfile.childBirthYears, retirementYear, activeRules) + activeRules.socialSecurity.careEmployerRate
console.log('--- KV/PV ---')
console.log('monthlyBase (lump/120):', monthlyBase.toFixed(2), 'BBG:', activeRules.socialSecurity.healthAndCareCapMonth)
console.log('healthRate:', (healthRate*100).toFixed(2)+'%', 'careRate:', (careRate*100).toFixed(2)+'%')
console.log('KV Freibetrag:', activeRules.socialSecurity.kvFreibetragVersorgungMonthly)

const kvPv = calculateRetirementKvPv({
  bavMonthlyVersorgungsbezuege: monthlyBase,
  otherMonthlyVersorgungsbezuege: 0,
  monthlyStatutoryPension: grvMonthly,
  freiwilligOtherMonthlyIncome: 0,
  isFreiwilligVersichert: false,
  kvFreibetragVersorgungMonthly: activeRules.socialSecurity.kvFreibetragVersorgungMonthly,
  pvFreigrenzeVersorgungMonthly: activeRules.socialSecurity.kvFreibetragVersorgungMonthly,
  monthlyKvPvBbg: activeRules.socialSecurity.healthAndCareCapMonth,
  healthRate,
  careRate,
})
const totalKvPv = (kvPv.bavKvMonthly + kvPv.bavPvMonthly) * 120
console.log('bavKvMonthly:', kvPv.bavKvMonthly.toFixed(2), 'bavPvMonthly:', kvPv.bavPvMonthly.toFixed(2))
console.log('total KV/PV burden over 120 months:', totalKvPv.toFixed(0), '=', (totalKvPv/lumpSum*100).toFixed(1)+'%')
console.log('total deduction %:', ((lumpSum - basis.afterTaxLumpSum)/lumpSum*100).toFixed(1)+'%')
