export type VergleichPaneSlug =
  | 'ueberblick'
  | 'entscheidung'
  | 'kapital'
  | 'rente'
  | 'break-even'
  | 'lifetime-einkommen'
  | 'fee-drag'
  | 'steuer-wasserfall'
  | 'kv-pv-last'
  | 'monte-carlo'
  | 'sequence-of-returns'
  | 'inflations-stress'
  | 'rendite'
  | 'beitrag'
  | 'lebenserwartung'
  | 'sens-retirement-age'
  | 'fairness'

export const ALL_VERGLEICH_PANES: readonly VergleichPaneSlug[] = [
  'ueberblick',
  'entscheidung',
  'kapital',
  'rente',
  'break-even',
  'lifetime-einkommen',
  'fee-drag',
  'steuer-wasserfall',
  'kv-pv-last',
  'monte-carlo',
  'sequence-of-returns',
  'inflations-stress',
  'rendite',
  'beitrag',
  'lebenserwartung',
  'sens-retirement-age',
  'fairness',
]
