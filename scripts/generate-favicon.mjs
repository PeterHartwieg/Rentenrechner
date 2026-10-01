// Writes public/favicon.ico from public/favicon.svg.
//
// Browsers use the SVG through the <link rel="icon"> in index.html, but some
// clients request /favicon.ico directly and ignore the link tag (search
// crawlers, iOS link previews). Without this file those requests hit the
// 404 page. Run by hand after changing the SVG: `node scripts/generate-favicon.mjs`.
//
// The ICO holds PNG-encoded images at 16, 32 and 48 px (PNG entries are valid
// in ICO since Windows Vista and in every current browser).
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8')
const sizes = [16, 32, 48]
const pngs = sizes.map((size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng())

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(sizes.length, 4)

let offset = 6 + 16 * sizes.length
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size, 0) // width
  entry.writeUInt8(size, 1) // height
  entry.writeUInt8(0, 2) // palette colours
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(pngs[i].length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  return entry
})

writeFileSync(join(root, 'public/favicon.ico'), Buffer.concat([header, ...entries, ...pngs]))
console.log(`public/favicon.ico written (${sizes.join(', ')} px)`)
