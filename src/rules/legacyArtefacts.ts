/**
 * Historical defects that the app must still recognise in stored user state.
 *
 * Nothing here is a statutory value. These constants are deliberately kept
 * out of `legalConstants.ts` and the `legalRuleData` catalog: they are not
 * rules, and adding them there would move the rules fingerprint that the
 * scenario-report suite freezes.
 */

/**
 * Pre-#394 hardcoded Entgeltpunkte denominator that the inventory wizard used
 * instead of `rules.socialSecurity.durchschnittsentgelt` (51 944 EUR for 2026).
 * Retained only so `detectLegacyEpSeed` can recognise seeds produced by that
 * defect and offer a re-estimate. Never use it in a calculation.
 */
export const legacyEpSeedDurchschnittsentgelt = 47_079

/**
 * Pre-#394 hardcoded Entgeltpunkte cap (Beitragsbemessungsgrenze) that the
 * inventory wizard's estimate was capped at, alongside the denominator above.
 * It coincides with the 2026 `pensionCapYear` (101 400 EUR), but unlike the
 * rule value it is frozen — retained only so `detectLegacyEpSeed` can invert
 * the defective estimator for payloads that predate `pensionEntryMethod`.
 * Never use it in a calculation.
 */
export const legacyEpSeedPensionCapYear = 101_400
