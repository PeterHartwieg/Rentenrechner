/** A page's .faq.json is shared by its visible FAQ and its route metadata. */
export interface FaqItem {
  readonly q: string
  /** Plain text; rendered as text in both HTML and JSON-LD. */
  readonly a: string
  readonly sources: readonly string[]
}

export function validateFaq(data: unknown, filename = 'faq.json'): readonly FaqItem[] {
  if (!Array.isArray(data)) throw new Error(`${filename}: expected an FAQ array`)
  for (const [index, item] of data.entries()) {
    if (
      !item || typeof item !== 'object' ||
      typeof item.q !== 'string' || !item.q.trim() ||
      typeof item.a !== 'string' || !item.a.trim() ||
      !Array.isArray(item.sources) || !item.sources.every(isHttpsUrl)
    ) {
      throw new Error(`${filename}[${index}]: expected non-empty q/a and an array of HTTPS source URLs`)
    }
  }
  return data
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
