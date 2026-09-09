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
import { assertExplicitComplexFlag } from './lib/panels.mjs'
import { parseFlags, requirePositiveInt } from './lib/cliArgs.mjs'

const PUBLISH_FAILURE_CODES = new Set(['STALE_HEAD', 'PR_MOVED', 'VERIFY_NOT_SUCCESSFUL'])

// `execute` is injectable so tests can pin what THIS entrypoint passes on
// (argv → review options), not just what the helpers do in isolation.
export async function main({ argv = process.argv.slice(2), execute = executeReview, log = console.log } = {}) {
  const { flags } = parseFlags(argv)
  if (!flags.pr) {
    console.error(
      'usage: npm run review:run -- --pr <number> [--complex] [--publish] [--comment] ' +
        '[--verify-commit <sha>] [--timeout-minutes <n>]',
    )
    return { exitCode: 1, result: null }
  }
  const pr = requirePositiveInt(flags, 'pr')
  const complex = assertExplicitComplexFlag(flags.complex)
  const publish = flags.publish === true
  const comment = flags.comment === true
  const verifyCommit = typeof flags['verify-commit'] === 'string' ? flags['verify-commit'] : null
  const timeoutMinutes = flags['timeout-minutes'] ? Number(flags['timeout-minutes']) : NaN
  const timeoutMs = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
    ? timeoutMinutes * 60 * 1000
    : DEFAULT_REVIEWER_TIMEOUT_MS

  const result = await execute({
    pr,
    complex,
    publish,
    comment,
    repoRoot: process.cwd(),
    verifyCommit,
    timeoutMs,
    ghRun: makeSubprocessRun(),
  })

  log(`Panel       : ${result.receipt.panel.kind}`)
  for (const review of result.reviews) {
    const status = review.verdict?.ok
      ? review.verdict.verdict.verdict
      : `INVALID (${review.parse?.reason ?? review.verdict?.reason})`
    log(`  ${review.reviewer} [${review.model}] -> ${status}`)
  }
  log(`Decision    : ${result.decision}`)
  for (const reason of result.reasons) log(`  gate: ${reason}`)
  log(`Receipt     : ${result.receiptPath}`)

  if (result.published) {
    log(`Published   : commit status "${result.published.state}" on ${result.published.headSha}`)
    if (result.published.verifyCheck) {
      log(`Verify check: ${result.published.verifyCheck.name} concluded ${result.published.verifyCheck.conclusion}`)
    }
  }

  // Exit codes are returned, not taken, so the entrypoint stays callable from
  // tests; the wrapper below is the only place that ends the process.
  if (!result.ok) return { exitCode: 1, result }
  if (result.decision !== 'approve') return { exitCode: 2, result }
  return { exitCode: 0, result }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(({ exitCode }) => {
      if (exitCode !== 0) process.exit(exitCode)
    })
    .catch((error) => {
      if (error.code && PUBLISH_FAILURE_CODES.has(error.code)) {
        console.error(`NOT PUBLISHED: ${error.message}`)
        process.exit(1)
      }
      console.error(error.message)
      process.exit(1)
    })
}
