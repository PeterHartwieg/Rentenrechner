export type MoneyBasis = 'real' | 'nominal'

/** Retirement-year amounts are deflated only at the display boundary. */
export function displayAtMoneyBasis(nominal: number, basis: MoneyBasis, deflator: number): number {
  return basis === 'real' ? nominal * deflator : nominal
}
