// Source-review catalog data.
//
// This file maps sources to the calculation areas they underpin. It does NOT
// duplicate dates or URLs for golden sources: those are reused from
// `validationSources` in src/test/externalGoldenFixtures.ts at report time
// (scripts/review/review-sources.ts). A vitest drift test pins that every id
// here exists there and vice versa.
//
// Research docs at the repo root are mapped explicitly, with their dates
// parsed from the docs' own header lines at report time.

export const RESEARCH_DOCS = [
  {
    path: 'TAX_SOCIAL_SECURITY_2026_RESEARCH.md',
    label: 'Tax And Social Security 2026 Research',
    areas: ['tax-payroll', 'kv-pv'],
  },
  {
    path: 'ETF_RESEARCH.md',
    label: 'ETF Depot Tax Research Germany 2026',
    areas: ['investment-insurance', 'tax-payroll'],
  },
  {
    path: 'BAV_RESEARCH.md',
    label: 'bAV Contract Research Germany 2026',
    areas: ['funding-eligibility', 'tax-payroll', 'kv-pv'],
  },
  {
    path: 'BASISRENTE_RESEARCH.md',
    label: 'Basisrente / Ruerup Research Germany 2026',
    areas: ['funding-eligibility', 'tax-payroll'],
  },
  {
    path: 'RIESTER_RESEARCH.md',
    label: 'Riester Altvertrag Research Germany 2026',
    areas: ['funding-eligibility', 'investment-insurance'],
  },
  {
    path: 'PRIVATE_RENTENVERSICHERUNG_RESEARCH.md',
    label: 'Private Rentenversicherung Contract Research Germany 2026',
    areas: ['investment-insurance', 'tax-payroll'],
  },
  {
    path: 'ALTERSVORSORGEDEPOT_2027_RESEARCH.md',
    label: 'Altersvorsorgedepot 2027 Research Germany',
    areas: ['funding-eligibility', 'investment-insurance', 'tax-payroll'],
  },
  {
    path: 'GRV_RESEARCH.md',
    label: 'GRV Research Germany 2026',
    areas: ['household-interactions'],
  },
  {
    path: 'RENTENPAKET_SCENARIO_RESEARCH.md',
    label: 'Rentenpaket 2025 audit + Rentenkommission 2026 design',
    areas: ['household-interactions', 'tax-payroll', 'funding-eligibility'],
  },
  {
    path: 'LEGAL_REVIEW.md',
    label: 'Legal Review (cross-product)',
    areas: [
      'tax-payroll',
      'kv-pv',
      'funding-eligibility',
      'investment-insurance',
      'household-interactions',
    ],
  },
  {
    path: 'LEGAL_IMPLEMENTATION_AUDIT_2026.md',
    label: 'Legal vs Implementation Audit 2026',
    areas: [
      'tax-payroll',
      'kv-pv',
      'funding-eligibility',
      'investment-insurance',
      'household-interactions',
    ],
  },
]

// Areas affected by each validationSources id. Keys must stay in sync with
// src/test/externalGoldenFixtures.ts (pinned by scripts/review/*.test.mjs).
export const GOLDEN_SOURCE_AREAS = {
  'bmf-est-2026-tariff': ['tax-payroll'],
  'bmf-lohnsteuerrechner-2026': ['tax-payroll', 'kv-pv'],
  'bmf-einkommensteuerrechner-2026': ['tax-payroll'],
  // SVBezGrV 2026 also sets the vorläufige Durchschnittsentgelt, which feeds
  // GRV Entgeltpunkte (SGB VI §64) — hence household-interactions.
  'bmas-sv-rechengroessen-2026': ['tax-payroll', 'kv-pv', 'funding-eligibility', 'household-interactions'],
  'bmas-rentenwert-2026': ['household-interactions'],
  'drv-rentenschaetzer-current-2026': ['household-interactions'],
  'sgb-vi-rentenformel': ['household-interactions'],
  'estg-retirement-cohort-tables': ['tax-payroll', 'kv-pv'],
  'bayern-alterseinkuenfte-rechner-2026': ['tax-payroll', 'kv-pv'],
  // §3 Nr. 63 EStG is the TAX-FREE side and §1 SvEvG the social-insurance-
  // free side of the same conversion limit, so this source underpins the tax
  // and KV/PV surfaces as well as the funding caps.
  'estg-bav-contribution-limits': ['funding-eligibility', 'tax-payroll', 'kv-pv'],
  'bmf-vorabpauschale-basiszins-2026': ['investment-insurance'],
  'estg-riester-allowance-rules': ['funding-eligibility'],
  'drv-zfa-riester-rechner': ['funding-eligibility'],
}

// Review records for golden sources, keyed by validationSources id. Golden
// sources start with NO review records — dates are only ever added by a real
// monthly audit (docs/automation/calculation-review-toolchain.md), never
// fabricated. Shape per id: { lastReviewed: 'YYYY-MM-DD', note?: string }.
// `note` should say what was checked and where the evidence lives (e.g. the
// golden fixture id + commit, or the audit note in a research doc).
export const GOLDEN_SOURCE_REVIEWS = {}
