/**
 * German copy for the "Optimiere deine Vorsorge" modal (B6).
 *
 * Pure module -- no React imports, no DOM access.
 *
 * Contains:
 *   - Disclaimer step heading, body paragraphs, and button labels.
 *   - Persistent banner text (all post-disclaimer steps).
 *   - Default scenario name templates per decision kind.
 *   - Audit-flag chip labels for the overview step.
 */

import type { ContractDecision } from '../app/contractDecisions'

// ---------------------------------------------------------------------------
// Disclaimer step
// ---------------------------------------------------------------------------

export const OPTIMIERE_DISCLAIMER_HEADING = 'Hinweis: Modellrechnung, keine Beratung'

export const OPTIMIERE_DISCLAIMER_PARAGRAPHS: readonly string[] = [
  'Mit „Optimiere deine Vorsorge“ kannst du durchspielen, was passiert, wenn du an deinen bestehenden Verträgen etwas änderst — zum Beispiel Beiträge erhöhst, einen Vertrag beitragsfrei stellst, kündigst oder zu einem anderen Anbieter überträgst.',
  'Das Tool erstellt dazu unverbindliche Modellrechnungen auf Basis deiner Eingaben und der gesetzlichen Werte für 2026. **Es ersetzt keine persönliche Beratung durch Steuer-, Renten- oder Versicherungsexpertinnen und ‑experten.**',
  'Vor einer echten Vertragsänderung — vor allem bei Kündigung, Übertragung oder Reduzierung von Garantien — sprich bitte mit einer unabhängigen Fachperson. Stornoabzüge, Steuerprivilegien und Zulagenrückforderungen hängen vom konkreten Vertrag ab und können hier nur näherungsweise geschätzt werden.',
  'Wenn du fortfährst, bleibt dein bestehender Plan unverändert. Du erstellst nur What-if-Szenarien, die du jederzeit wieder löschen kannst.',
]

export const OPTIMIERE_BUTTON_ACCEPT = 'Verstanden, weiter'
export const OPTIMIERE_BUTTON_CANCEL = 'Abbrechen'

// ---------------------------------------------------------------------------
// Persistent banner (overview, instance, confirm, saved steps)
// ---------------------------------------------------------------------------

export const OPTIMIERE_BANNER =
  'Modellrechnung — keine Steuer-, Renten- oder Versicherungsberatung. Vor echten Vertragsänderungen bitte unabhängige Fachperson hinzuziehen.'

// ---------------------------------------------------------------------------
// Entry button
// ---------------------------------------------------------------------------

export const OPTIMIERE_BUTTON_LABEL = 'Optimiere deine Vorsorge'

export const OPTIMIERE_DISABLED_TOOLTIP =
  'Sobald du mindestens einen Vertrag erfasst hast, kannst du Optionen durchspielen.'

// ---------------------------------------------------------------------------
// Confirm step
// ---------------------------------------------------------------------------

export const OPTIMIERE_CONFIRM_HEADING = 'Ausgewählte Pläne'
export const OPTIMIERE_CONFIRM_SAVE = 'Pläne erstellen'
export const OPTIMIERE_CONFIRM_BACK = 'Zurück'

// ---------------------------------------------------------------------------
// Saved step
// ---------------------------------------------------------------------------

export const OPTIMIERE_SAVED_HEADING = 'Szenarien erstellt'
export const OPTIMIERE_SAVED_CLOSE = 'Schließen'

// ---------------------------------------------------------------------------
// Audit flag labels (overview step chips)
// ---------------------------------------------------------------------------

export const AUDIT_FLAG_LABELS: Record<string, string> = {
  // Audit-flag atoms (issue B3)
  high_cost_active: 'Hohe Kosten',
  weak_guarantee: 'Schwache Garantie',
  low_flexibility: 'Geringe Flexibilität',
  missing_offer_data: 'Angebotsdaten fehlen',
  funding_cap_hit: 'Fördergrenze überschritten',
  // Vintage-detection atoms (pAV)
  pre_2005_pav_taxfree_capital: 'Steuerfreie Kapitalauszahlung',
  halbeinkuenfte_pav_eligible: 'Halbeinkünfteverfahren',
  pre_2005_pav_high_garantiezins: 'Hoher Garantiezins',
  // Vintage-detection atoms (bAV)
  bav_40b_alt_eligible: '§40b-Privileg aktiv',
  bav_40b_alt_conditions_unmet: '§40b-Bedingungen unerfüllt',
  bav_durchfuehrungsweg_direktzusage: 'Fünftelregelung',
  // Vintage-detection atoms (Riester)
  riester_pre_2008_zulage: 'Kinderzulage prüfen',
  // Cap atoms that are per-instance (AVD)
  avd_cap_remaining: 'AVD-Beitragslimit',
}

// ---------------------------------------------------------------------------
// Default scenario name templates (decisions.md Section 7)
// ---------------------------------------------------------------------------

export interface ScenarioNameContext {
  contractLabel: string
  neuerEUR?: number
  age?: number
  targetLabel?: string
  productLabel?: string
}

/**
 * Generate the default what-if scenario name for a given decision.
 */
export function defaultScenarioName(
  decision: ContractDecision,
  ctx: ScenarioNameContext,
): string {
  switch (decision.kind) {
    case 'beitrag-erhoehen': {
      const eur = decision.workspaceDelta.kind === 'increase_contribution'
        ? decision.workspaceDelta.newMonthlyEUR
        : (ctx.neuerEUR ?? 0)
      return `${ctx.contractLabel} – Beitrag ${Math.round(eur)} €/Monat`
    }
    case 'beitragsfrei': {
      const paidUpAge = decision.workspaceDelta.kind === 'paid_up'
        ? decision.workspaceDelta.paidUpAtAge
        : (ctx.age ?? 0)
      return `${ctx.contractLabel} – beitragsfrei ab Alter ${paidUpAge}`
    }
    case 'kuendigen': {
      if (decision.workspaceDelta.kind === 'surrender' && decision.workspaceDelta.reallocateToInstanceId) {
        return `${ctx.contractLabel} → ${ctx.targetLabel ?? 'Reinvest'}`
      }
      return `${ctx.contractLabel} – kündigen`
    }
    case 'uebertragen': {
      if (decision.workspaceDelta.kind === 'transfer_to_new') {
        return `${ctx.contractLabel} → neues ${ctx.productLabel ?? 'Produkt'}`
      }
      return `${ctx.contractLabel} → ${ctx.targetLabel ?? 'Ziel'}`
    }
    case 'weiterfuehren':
      return `${ctx.contractLabel} – weiterführen`
  }
}
