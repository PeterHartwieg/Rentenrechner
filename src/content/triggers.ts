/**
 * Trigger-card configuration for the guided-setup flow and the comparison
 * picker. Lifted out of `GuidedSetup.tsx` and `ComparisonPicker.tsx` so that
 * Group G entry flows can extend the catalogue without touching component
 * code. Pure content + types — no React, no engine imports.
 *
 * Adding a new entry path:
 *  1. Add an id to `GuidedPath`.
 *  2. Add a row to `PATH_OPTIONS` (id, title, description, optional fields).
 *  3. Add a row to `VISIBLE_PRODUCTS_BY_PATH` (which products start visible).
 *  4. Add a matching entry to `WIZARD_REGISTRY` in
 *     `src/features/guidance/wizards/wizardRegistry.tsx` — no other edits required.
 */

import type { ProductId } from '../domain'

export type GuidedPath =
  | 'bav_offer'
  | 'etf_vs_insurance'
  | 'rentengap'
  | 'low_income_parent'
  | 'beamter'
  | 'expert'

/**
 * Names of pre-built scenario templates from `recommendations.ts` that are
 * relevant to this trigger. Used by issue-18+ to pre-populate the what-if
 * panel when the user lands from this path. P2 — not consumed yet.
 */
export type WhatIfTemplateName = string

/**
 * Hints for the recommender engine about which result dimensions to
 * emphasise for this trigger's user. P2 — not consumed yet.
 */
export interface RecommenderBias {
  emphasiseP10?: boolean
  emphasiseTaxLeverage?: boolean
}

export interface GuidedPathOption {
  id: GuidedPath
  title: string
  description: string
  /** Names of pre-built what-if scenario templates relevant to this trigger. */
  whatIfTemplates?: WhatIfTemplateName[]
  /** Hints for the recommender about which dimensions to surface. */
  recommenderBias?: RecommenderBias
}

const ALL_PRODUCTS: readonly ProductId[] = [
  'etf',
  'bav',
  'versicherung',
  'basisrente',
  'altersvorsorgedepot',
  'riester',
] as const

export const PATH_OPTIONS: readonly GuidedPathOption[] = [
  {
    id: 'bav_offer',
    title: 'Ich habe ein bAV-Angebot',
    description:
      'Ein Arbeitgeber- oder Versicherungs-Angebot zur Entgeltumwandlung prüfen — inkl. AG-Zuschuss, Steuern und KV/PV in der Rente.',
  },
  {
    id: 'etf_vs_insurance',
    title: 'ETF gegen Versicherung vergleichen',
    description:
      'Was bringt ein günstiges ETF-Depot im Vergleich zu einer privaten Rentenversicherung — mit Kosten, Steuer und Auszahlungsform.',
  },
  {
    id: 'rentengap',
    title: 'Rentenlücke grob schätzen',
    description:
      'Wie viel netto bleibt aus der gesetzlichen Rente — und welche zusätzliche Vorsorge schließt die Lücke realistisch?',
  },
  {
    id: 'low_income_parent',
    title: 'Ich spare mit Kindern und kleinem Budget',
    description:
      'Teilzeit, Kinder, enges Budget — Riester-Zulagen und AVD optimal nutzen. Wir zeigen, wie viel der Staat beisteuert.',
    recommenderBias: { emphasiseP10: true },
  },
  {
    id: 'beamter',
    title: 'Ich bin Beamter oder im Versorgungswerk',
    description:
      'Beamtenpension oder berufsständisches Versorgungswerk als Basis — GRV und bAV entfallen. Basisrente als Schicht-1-Ergänzung.',
    recommenderBias: { emphasiseTaxLeverage: true },
  },
  {
    id: 'expert',
    title: 'Expertenmodus',
    description:
      'Direkt ins volle Dashboard mit allen Eingaben. Geführter Einstieg wird übersprungen.',
  },
] as const

/**
 * Visible-product preset per guided path. The path choice is the user's
 * strongest signal about which products are relevant — narrowing the
 * comparison up front reduces noise. The user can re-add products via the
 * comparison picker at any time.
 */
export const VISIBLE_PRODUCTS_BY_PATH: Record<GuidedPath, ProductId[]> = {
  bav_offer: ['etf', 'bav'],
  etf_vs_insurance: ['etf', 'versicherung'],
  // Pension-gap users typically don't want a 6-way comparison up front. Start
  // with ETF + bAV (the most common decision pair) and let them add other
  // products via the comparison picker.
  rentengap: ['etf', 'bav'],
  // Low-income parent: Riester Zulagen-leverage is the primary differentiator;
  // AVD as the modern alternative, ETF as the baseline reference.
  low_income_parent: ['riester', 'altersvorsorgedepot', 'etf'],
  // Beamter: no GRV/bAV; Basisrente is the primary Schicht-1 product;
  // ETF as flexible Schicht-3 reference, pAV as the classic Schicht-3 alternative.
  beamter: ['basisrente', 'etf', 'versicherung'],
  expert: [...ALL_PRODUCTS],
}

/**
 * Product groupings for the comparison picker. PRIMARY products show on the
 * always-visible chip row; SECONDARY products live behind a "Weitere
 * Produkte" disclosure. Adjust here, not in the picker component.
 */
export const PRIMARY_PRODUCT_IDS: readonly ProductId[] = ['etf', 'bav', 'versicherung'] as const
export const SECONDARY_PRODUCT_IDS: readonly ProductId[] = [
  'basisrente',
  'altersvorsorgedepot',
  'riester',
] as const
