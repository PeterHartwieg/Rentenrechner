import { readFileSync } from 'node:fs'

const content = readFileSync('src/seo/publicRouteRegistry.ts', 'utf8')

// Match each route entry between key and closing brace before next entry or end
const routeRegex = /'(\/[^']*)':\s*\{\s*canonical:[\s\S]*?calculatorCta:/g

const entries = []
let m
while ((m = routeRegex.exec(content)) !== null) {
  const key = m[1]
  const body = m[0]
  const titleMatch = body.match(/title:\s*'([^']*)'/)
  const h1Match = body.match(/h1:\s*'([^']*)'/)
  // multi-line concatenations
  const metaMatch = body.match(/metaDescription:\s*([\s\S]*?),\s*h1:/)
  const summaryMatch = body.match(/summary:\s*([\s\S]*?),\s*dateModified:/)
  const dateMatch = body.match(/dateModified:\s*'([^']*)'/)

  function joinStr(blob) {
    if (!blob) return null
    const parts = [...blob.matchAll(/'([^']*)'/g)].map((x) => x[1])
    return parts.join('')
  }
  const meta = joinStr(metaMatch ? metaMatch[1] : null)
  const summary = joinStr(summaryMatch ? summaryMatch[1] : null)
  entries.push({
    key,
    title: titleMatch ? titleMatch[1] : null,
    h1: h1Match ? h1Match[1] : null,
    meta,
    summary,
    date: dateMatch ? dateMatch[1] : null,
  })
}

console.log('Route\tTitleLen\tDescLen\tTitleEm\tDescEm\tH1Em\tSumEm\tDate')
for (const e of entries) {
  const tlen = e.title ? e.title.length : 0
  const dlen = e.meta ? e.meta.length : 0
  const tEm = e.title && e.title.includes('—') ? 'Y' : ''
  const dEm = e.meta && e.meta.includes('—') ? 'Y' : ''
  const hEm = e.h1 && e.h1.includes('—') ? 'Y' : ''
  const sEm = e.summary && e.summary.includes('—') ? 'Y' : ''
  console.log([e.key, tlen, dlen, tEm, dEm, hEm, sEm, e.date].join('\t'))
}

console.log('\n=== TITLES ===')
for (const e of entries) console.log(`${e.key} [${e.title?.length || 0}] ${e.title}`)
console.log('\n=== DESCRIPTIONS ===')
for (const e of entries) console.log(`${e.key} [${e.meta?.length || 0}] ${e.meta}`)
console.log('\n=== H1s ===')
for (const e of entries) console.log(`${e.key} [${e.h1?.length || 0}] ${e.h1}`)
console.log('\n=== SUMMARIES ===')
for (const e of entries) console.log(`${e.key} [${e.summary?.length || 0}] ${e.summary}`)

// Cliché counts in metaDescriptions
console.log('\n=== CLICHÉ COUNT in metaDescription ===')
const cliches = ['Stand 2026', 'Werte 2026', 'Modellrechnung', 'kostenlos', 'Kostenlos', 'lokal']
for (const e of entries) {
  if (!e.meta) continue
  const counts = {}
  for (const c of cliches) {
    const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    const matches = e.meta.match(re)
    if (matches) counts[c] = matches.length
  }
  if (Object.keys(counts).length > 0) {
    console.log(`${e.key}: ${JSON.stringify(counts)}`)
  }
}

// §-citation counts in metaDescriptions
console.log('\n=== § citations in metaDescription ===')
for (const e of entries) {
  if (!e.meta) continue
  const matches = e.meta.match(/§\s*\d/g)
  if (matches && matches.length > 0) {
    console.log(`${e.key}: ${matches.length} citation(s) — ${matches.join(', ')}`)
  }
}
