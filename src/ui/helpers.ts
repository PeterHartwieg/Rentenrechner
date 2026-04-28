import type { ProductResult } from '../domain'

export function bestResult<T extends ProductResult>(results: T[], selector: (result: T) => number) {
  return results.reduce((best, result) => (selector(result) > selector(best) ? result : best))
}
