#!/usr/bin/env node
// Fake `gh` for CLI entrypoint tests. NEVER contacts the network: it answers
// the four read-only calls collectPrInfo makes (pr view ×2 with the branch
// head in between, pr diff --name-only, pr diff) from canned data, and
// records every invocation in $FAKE_GH_LOG so a test can prove which calls
// happened — including that a rejected flag caused NONE.

import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
const log = process.env.FAKE_GH_LOG
if (log) appendFileSync(log, `${args.join(' ')}\n`, 'utf8')

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

if (args[0] === 'pr' && args[1] === 'view') {
  process.stdout.write(
    JSON.stringify({
      number: 42,
      headRefOid: HEAD,
      headRefName: 'codex/some-fix',
      baseRefOid: BASE,
      baseRefName: 'main',
      title: 'Fake PR for CLI tests',
      url: 'https://example.invalid/pull/42',
    }),
  )
} else if (args[0] === 'api' && args.includes('.commit.sha')) {
  process.stdout.write(`${BASE}\n`)
} else if (args[0] === 'pr' && args[1] === 'diff' && args.includes('--name-only')) {
  process.stdout.write('src/engine/tax.ts\n')
} else if (args[0] === 'pr' && args[1] === 'diff') {
  process.stdout.write('diff --git a/src/engine/tax.ts\n+const x = 1\n')
} else {
  process.stderr.write(`fake gh: unexpected call ${args.join(' ')}\n`)
  process.exit(1)
}
