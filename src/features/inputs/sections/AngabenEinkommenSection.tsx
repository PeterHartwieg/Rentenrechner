import { useMemo } from 'react'
import { activeRules } from '../../../rules'
import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'
import { NumberField } from '../../../ui/NumberField'
import { clampNumber } from '../../../ui/formatting'
import { formatCurrency } from '../../../utils/format'
import {
  resolveNettoBelastungTarget,
  syncMonthlyContributions,
} from '../../../utils/syncContributions'
import { de2026Rules } from '../../../rules/de2026'

/**
 * `§ 2 Einkommen` for `/eingaben`. Extracted from `AngabenPage.tsx` so the
 * page shell stays a thin orchestrator and so the section conventions (one
 * file per § section, slice + setter props) match the rest of
 * `src/features/inputs/sections/`.
 *
 * Numeric fields bound to engine-shaped state route through `<NumberField>`
 * per the CLAUDE.md "UI rounding boundary" rule.
 *
 * **bAV-Brutto ownership is mode-explicit** (input-followups plan 2). The bAV
 * gross conversion is a *derived* quantity in compare mode:
 * `harmonizeOnLoad` / `syncMonthlyContributions` back-solve it from the
 * shared "Netto-Beitrag" anchor (§ 4), so a directly editable gross field
 * here was silently reverted on the next sync — the user typed €500 gross,
 * opened the comparison, and came back to the re-derived value. This section
 * therefore:
 *  - compare mode → renders the gross as a **read-only, freshly derived**
 *    metric. The value is recomputed from the current anchor + profile with
 *    the same `syncMonthlyContributions` helper the sync setter uses, so a
 *    salary / Steuerklasse edit never leaves a stale saved gross on screen
 *    and no second funding formula exists. The anchor itself resolves through
 *    the canonical `resolveNettoBelastungTarget` — identical to the
 *    compare-mode load path — so legacy `compareSubMode: 'equal_cash'` saves
 *    (whose `equalInputAmountEUR` is cleared on load) show the bAV net cost
 *    the dashboard derives, not 0 EUR. The budget is edited in § 4
 *    (Netto-Beitrag).
 *  - combine mode → renders **no** bAV gross control at all. The singleton
 *    projection used to write such an edit onto the first active bAV
 *    instance (or silently drop it with zero instances); per-contract bAV
 *    inputs live in Schritt 2 (`/eingaben/produkte`) and `/vertrag/:instanceId`.
 *
 * This preserves the fair-comparison invariant: every compare-mode product
 * still invests `bavFunding.monthlyNetCost`, and the only public knob for
 * that budget remains the Netto-Beitrag anchor.
 */

interface Props {
  /** Which store this page is bound to. Controls bAV-gross ownership. */
  mode: 'compare' | 'combine'
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  /** Read-only view of the active singleton assumptions; supplies the
   *  contribution anchor for the compare-mode derived bAV gross. */
  assumptions: ScenarioAssumptions
  num: string
  id: string
  title: string
}

export function AngabenEinkommenSection({
  mode,
  profile,
  setProfile,
  assumptions,
  num,
  id,
  title,
}: Props) {
  // Compare-mode only: the bAV gross the current anchor + profile imply.
  // Re-derived on every anchor/profile change instead of reading the stored
  // `assumptions.bav.monthlyGrossConversion`, so the display cannot go stale
  // while the user edits salary or Steuerklasse. Runs the canonical anchor
  // resolution + sync helper — no second funding formula (fair-comparison
  // invariant). In pinned AVD-own mode the sync helper derives the anchor
  // from the pinned Eigenbeitrag and ignores the resolved target, so this
  // call is correct in every contribution mode.
  const derivedBavGross = useMemo(() => {
    if (mode !== 'compare') return 0
    const target = resolveNettoBelastungTarget(profile, assumptions, de2026Rules)
    return syncMonthlyContributions(target, assumptions, profile, de2026Rules)
      .bav.monthlyGrossConversion
  }, [mode, assumptions, profile])

  return (
    <section className="angaben-section">
      <div className="angaben-section-head">
        <span className="angaben-section-num">{num}</span>
        <h2 id={id} className="angaben-section-title">
          {title}
        </h2>
      </div>
      <p className="angaben-section-lead">
        Bruttogehalt steuert Lohnsteuer, Vorsorgepauschale und die
        Förderhöchstbeträge der betrieblichen Altersvorsorge.
      </p>

      <div className="angaben-fields">
        <div className="angaben-field">
          <NumberField
            label="Bruttoeinkommen pro Jahr"
            value={profile.grossSalaryYear}
            min={0}
            step={500}
            suffix="EUR p.a."
            onChange={(value) =>
              setProfile((p) => ({
                ...p,
                grossSalaryYear: Math.max(0, Number(value)),
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Vorsorgepauschale § 39b EStG; § 3 Nr. 63 EStG / § 1 SvEV
            </span>
          </span>
        </div>

        {mode === 'compare' ? (
          // A <div>, not a <label>: this metric contains no labelable form
          // control, and a label without one invites assistive tech to
          // announce a broken input. The `.angaben-field` class keeps the
          // visual receipt layout identical to the editable fields around it.
          <div className="angaben-field" data-testid="angaben-bav-gross-derived">
            <span className="angaben-field-label">bAV-Brutto (berechnet)</span>
            <span className="angaben-field-shell">
              <span>{formatCurrency(derivedBavGross, 0)}</span>
              <span className="angaben-field-suffix">mtl.</span>
            </span>
            <span className="angaben-field-meta">
              <span className="angaben-field-hint">
                Wird aus dem Netto-Beitrag (§ 4 Annahmen) abgeleitet — dort
                änderst du den monatlichen Vergleichsbetrag. Steuerfrei bis{' '}
                {formatCurrency(
                  (activeRules.socialSecurity.pensionCapYear *
                    activeRules.bav.taxFreePctOfPensionCap) /
                    12,
                  0,
                )}
                /Monat (§ 3 Nr. 63 EStG); SV-frei bis{' '}
                {formatCurrency(
                  (activeRules.socialSecurity.pensionCapYear *
                    activeRules.bav.socialSecurityFreePctOfPensionCap) /
                    12,
                  0,
                )}
                /Monat (§ 1 SvEV). Beide Grenzen gelten für den Gesamtbeitrag
                einschließlich Arbeitgeberzuschuss.
              </span>
            </span>
          </div>
        ) : (
          <p
            className="angaben-field-hint"
            data-testid="angaben-bav-combine-hint"
          >
            bAV-Verträge pflegst du pro Vertrag in Schritt 2 („Deine
            Verträge“) — dort gehört die Brutto-Umwandlung hin.
          </p>
        )}

        {profile.publicHealthInsurance && (
          <div className="angaben-field">
            <NumberField
              label="GKV-Zusatzbeitrag"
              value={profile.healthAdditionalContributionPct}
              min={0}
              max={5}
              step={0.1}
              decimals={1}
              suffix="% p.a."
              onChange={(value) =>
                setProfile((p) => ({
                  ...p,
                  // Clamp to the same UI bounds so out-of-range typed values
                  // never reach STORAGE_KEY_V1 (`<input type="number">` doesn't
                  // reject typed out-of-range). validateState's permissive
                  // 0..10 range catches anything above 10 anyway, but we
                  // mirror the UI bound for clarity.
                  healthAdditionalContributionPct: clampNumber(Number(value), 0, 5),
                }))
              }
            />
            <span className="angaben-field-meta">
              <span className="angaben-field-hint">
                Kassenindividuell; Lohnsteuer-PAP nutzt diesen Wert direkt
              </span>
            </span>
          </div>
        )}

        {!profile.publicHealthInsurance && (
          <div className="angaben-field">
            <NumberField
              label="PKV-Prämie (KV)"
              value={profile.pkvMonthlyPremium}
              min={0}
              step={10}
              suffix="EUR mtl."
              onChange={(value) =>
                setProfile((p) => ({
                  ...p,
                  pkvMonthlyPremium: Math.max(0, Number(value)),
                }))
              }
            />
            <span className="angaben-field-meta">
              <span className="angaben-field-hint">
                Beitragszuschuss § 257 SGB V; Teilbeträge gehen in die Vorsorgepauschale
              </span>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
