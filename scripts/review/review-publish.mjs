#!/usr/bin/env node
// npm run review:publish -- --receipt <path> [--comment]
//
// Publishes an existing receipt's decision as the `calculation-review` commit
// status (and optionally a concise PR comment). Re-fetches the exact PR head
// first and refuses to publish if the PR moved since the review. Never merges.

import { pathToFileURL } from 'node:url'

import { loadReceipt, publishCommitStatus } from './lib/publish.mjs'
import { makeSubprocessRun } from './lib/ghRun.mjs'
import { parseFlags } from './lib/cliArgs.mjs'

async function main() {
  const { flags } = parseFlags(process.argv.slice(2))
  if (typeof flags.receipt !== 'string') {
    console.error('usage: npm run review:publish -- --receipt <path> [--comment]')
    process.exit(1)
  }

  const receipt = loadReceipt(flags.receipt)
  try {
    const published = await publishCommitStatus({
      receipt,
      run: makeSubprocessRun(),
      repoRoot: process.cwd(),
      comment: flags.comment === true,
    })
    console.log(`Published   : commit status "${published.state}" on ${published.headSha}`)
    if (flags.comment) console.log('PR comment  : posted (concise receipt)')
  } catch (error) {
    if (error.code === 'STALE_HEAD') {
      console.error(`NOT PUBLISHED: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
