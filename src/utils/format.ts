export function formatCurrency(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits,
  }).format(value)
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    maximumFractionDigits,
  }).format(value)
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits,
  }).format(value)
}
