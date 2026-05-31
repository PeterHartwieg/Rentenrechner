/**
 * Translation coverage — what still needs translating.
 *
 * Run:
 *   npm run copy:missing                 # missing English (default)
 *   npm run copy:missing -- --lang en
 *   npm run copy:missing -- --lang de    # completeness check of the source lang
 *   npm run copy:missing -- --json
 *
 * Non-blocking: always exits 0 (missing translations are expected progress,
 * not a failure). Works without starting the app (vite-node).
 */
import {
  buildTranslationReport,
  formatTranslationReport,
} from '../src/content/copy/bilingual'

const argv = process.argv.slice(2)
const json = argv.includes('--json')

let lang = 'en'
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--lang') {
    lang = argv[i + 1] ?? lang
    i += 1
  } else if (arg.startsWith('--lang=')) {
    lang = arg.slice('--lang='.length)
  }
}

if (lang !== 'de' && lang !== 'en') {
  console.error(`Unknown --lang "${lang}". Supported: de, en.`)
  process.exit(1)
}

const report = buildTranslationReport(lang)

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(formatTranslationReport(report))
}
