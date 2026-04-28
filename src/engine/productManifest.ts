import { metadata as etfMeta } from './products/etf'
import { metadata as bavMeta } from './products/bav'
import { metadata as insuranceMeta } from './products/insurance'
import { metadata as basisrenteMeta } from './products/basisrente'
import { metadata as avdMeta } from './products/altersvorsorgedepot'
import { metadata as riesterMeta } from './products/riester'

export const PRODUCT_MANIFEST = [etfMeta, bavMeta, insuranceMeta, basisrenteMeta, avdMeta, riesterMeta] as const

export type ProductManifestEntry = typeof PRODUCT_MANIFEST[number]

export function getProductMeta(productId: string): ProductManifestEntry | undefined {
  return PRODUCT_MANIFEST.find(m => m.id === productId)
}
