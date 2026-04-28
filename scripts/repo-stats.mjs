// Prints a concise inventory of the repo for agent context.
// Run with: node scripts/repo-stats.mjs
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

const SRC_EXTS = new Set(['.ts', '.tsx', '.mjs', '.mts'])
const TEST_RE = /\.(test|spec)\.(ts|tsx)$/
const DOC_EXTS = new Set(['.md'])

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
      walk(full, files)
    } else {
      files.push(full)
    }
  }
  return files
}

function countLines(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').length
  } catch {
    return 0
  }
}

function countExports(path) {
  try {
    const src = readFileSync(path, 'utf8')
    return (src.match(/^export\s+(function|const|class|type|interface|enum|default)/gm) || []).length
  } catch {
    return 0
  }
}

function rel(p) {
  return relative(ROOT, p).replace(/\\/g, '/')
}

const allFiles = walk(ROOT)

const srcFiles = allFiles.filter(f => {
  const ext = extname(f)
  return SRC_EXTS.has(ext) && !TEST_RE.test(f)
})
const testFiles = allFiles.filter(f => TEST_RE.test(f))
const docFiles = allFiles.filter(f => DOC_EXTS.has(extname(f)))

const srcStats = srcFiles.map(f => ({ path: rel(f), lines: countLines(f), exports: countExports(f) }))
const testStats = testFiles.map(f => ({ path: rel(f), lines: countLines(f) }))

srcStats.sort((a, b) => b.lines - a.lines)
testStats.sort((a, b) => b.lines - a.lines)

const totalSrc = srcStats.reduce((s, f) => s + f.lines, 0)
const totalTest = testStats.reduce((s, f) => s + f.lines, 0)
const totalDoc = docFiles.reduce((s, f) => s + countLines(f), 0)

console.log('=== Largest source files (top 15) ===')
for (const f of srcStats.slice(0, 15)) {
  console.log(`  ${String(f.lines).padStart(5)}  ${String(f.exports).padStart(3)} exports  ${f.path}`)
}

console.log('\n=== Largest test files (top 10) ===')
for (const f of testStats.slice(0, 10)) {
  console.log(`  ${String(f.lines).padStart(5)}  ${f.path}`)
}

console.log('\n=== Totals ===')
console.log(`  Source files : ${srcFiles.length} files, ${totalSrc} lines`)
console.log(`  Test files   : ${testFiles.length} files, ${totalTest} lines`)
console.log(`  Doc files    : ${docFiles.length} files, ${totalDoc} lines`)
