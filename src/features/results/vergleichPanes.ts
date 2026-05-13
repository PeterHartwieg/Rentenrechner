export type VergleichPaneSlug =
  | 'dashboard'
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
  | 'renteneintrittsalter'
  | 'fairness'

export const ALL_VERGLEICH_PANES: readonly VergleichPaneSlug[] = [
  'dashboard',
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
  'renteneintrittsalter',
  'fairness',
]
