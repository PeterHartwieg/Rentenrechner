#!/usr/bin/env node
// npm run review:run -- --pr <number> [--complex] [--publish] [--comment]
//                          [--verify-commit <sha>] [--timeout-minutes <n>]
//
// Full local calculation review: plan -> prompt -> panel review -> verdict
// gate -> receipt. With --publish, additionally sets the `calculation-review`
// commit status via gh (after re-fetching the exact PR head; stale receipts
// are rejected). Never merges.
//
// Exit codes: 0 = approve; 2 = decision reject or needs-human;
// 1 = tooling/validation failure (including any reviewer that failed closed).

import { pathToFileURL } from 'node:url'

import { executeReview, DEFAULT_REVIEWER_TIMEOUT_MS } from './lib/orchestrate.mjs'
import { loadReceipt, publishCommitStatus } from './lib/publish.mjs'
import { makeSubprocessRun } from './lib/ghRun.mjs'
import { parseFlags, requirePositiveInt } from './lib/cliArgs.mjs'

async function main() {
  const { flags } = parseFlags(process.argv.slice(2))
  if (!flags.pr) {
    console.error(
      'usage: npm run review:run -- --pr <number> [--complex] [--publish] [--comment] ' +
        '[--verify-commit <sha>] [--timeout-minutes <n>]',
    )
    process.exit(1)
  }
  const pr = requirePositiveInt(flags, 'pr')
  const complex = flags.complex === true
  const verifyCommit = typeof flags['verify-commit'] === 'string' ? flags['verify-commit'] : null
  const timeoutMinutes = flags['timeout-minutes'] ? Number(flags['timeout-minutes']) : NaN
  const timeoutMs = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
    ? timeoutMinutes * 60 * 1000
    : DEFAULT_REVIEWER_TIMEOUT_MS

  const result = await executeReview({ pr, complex, repoRoot: process.cwd(), verifyCommit, timeoutMs })

  console.log(`Panel       : ${result.receipt.panel.kind}`)
  for (const review of result.reviews) {
    const status = review.verdict?.ok
      ? review.verdict.verdict.verdict
      : `INVALID (${review.parse?.reason ?? review.verdict?.reason})`
    console.log(`  ${review.reviewer} [${review.model}] -> ${status}`)
  }
  console.log(`Decision    : ${result.decision}`)
  for (const reason of result.reasons) console.log(`  gate: ${reason}`)
  console.log(`Receipt     : ${result.receiptPath}`)

  if (flags.publish) {
    const receipt = loadReceipt(result.receiptPath)
    try {
      const published = await publishCommitStatus({
        receipt,
        run: makeSubprocessRun(),
        repoRoot: process.cwd(),
        comment: flags.comment === true,
      })
      console.log(`Published   : commit status "${published.state}" on ${published.headSha}`)
    } catch (error) {
      if (error.code === 'STALE_HEAD') {
        console.error(`NOT PUBLISHED: ${error.message}`)
        process.exit(1)
      }
      throw error
    }
  }

  if (!result.ok) process.exit(1)
  if (result.decision !== 'approve') process.exit(2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
