#!/usr/bin/env node
// npm run review:run -- --pr <number> [--complex] [--publish] [--comment]
//                          [--verify-commit <sha>] [--timeout-minutes <n>]
//
// Full local calculation review: plan -> pinned worktree at the exact head
// SHA -> prompt -> panel review -> verdict gate -> receipt. With --publish,
// additionally sets the `calculation-review` commit status via gh — only
// from the current in-memory run (never from a receipt file), only if the
// PR head AND base are unchanged, and for an approving decision only if the
// deterministic `verify` check run concluded success on that exact SHA.
// Never merges.
//
// Exit codes: 0 = approve; 2 = decision reject or needs-human;
// 1 = tooling/validation failure (including any reviewer that failed closed
// or a refused publish).

import { pathToFileURL } from 'node:url'

import { executeReview, DEFAULT_REVIEWER_TIMEOUT_MS } from './lib/orchestrate.mjs'
import { makeSubprocessRun } from './lib/ghRun.mjs'
import { parseFlags, requirePositiveInt } from './lib/cliArgs.mjs'

const PUBLISH_FAILURE_CODES = new Set(['STALE_HEAD', 'PR_MOVED', 'VERIFY_NOT_SUCCESSFUL'])

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
  const publish = flags.publish === true
  const comment = flags.comment === true
  const verifyCommit = typeof flags['verify-commit'] === 'string' ? flags['verify-commit'] : null
  const timeoutMinutes = flags['timeout-minutes'] ? Number(flags['timeout-minutes']) : NaN
  const timeoutMs = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
    ? timeoutMinutes * 60 * 1000
    : DEFAULT_REVIEWER_TIMEOUT_MS

  const result = await executeReview({
    pr,
    complex,
    publish,
    comment,
    repoRoot: process.cwd(),
    verifyCommit,
    timeoutMs,
    ghRun: makeSubprocessRun(),
  })

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

  if (result.published) {
    console.log(`Published   : commit status "${result.published.state}" on ${result.published.headSha}`)
    if (result.published.verifyCheck) {
      console.log(
        `Verify check: ${result.published.verifyCheck.name} concluded ${result.published.verifyCheck.conclusion}`,
      )
    }
  }

  if (!result.ok) process.exit(1)
  if (result.decision !== 'approve') process.exit(2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error.code && PUBLISH_FAILURE_CODES.has(error.code)) {
      console.error(`NOT PUBLISHED: ${error.message}`)
      process.exit(1)
    }
    console.error(error.message)
    process.exit(1)
  })
}
