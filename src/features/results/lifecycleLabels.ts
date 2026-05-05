import { getProductMeta } from '../../app/productPresentation'
import type { LifecycleSeriesResult } from './breakEvenSeries'

export function lifecyclePickerLabel(result: LifecycleSeriesResult): string {
  const meta = getProductMeta(result.productId)
  return result.productId === 'portfolio' || result.label.includes('Vertr')
    ? result.label
    : (meta?.shortLabel ?? result.label)
}
