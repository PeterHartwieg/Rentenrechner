#!/usr/bin/env node
// npm run review:plan -- --pr <number> [--complex] [--json]
//
// Inspects the PR (exact head SHA + changed files via gh) and prints the
// review plan: impact mapping, panel, reviewer commands, context files.
// Read-only. Never contacts a model CLI.

import { pathToFileURL } from 'node:url'
import { describeReviewerBin } from './lib/binPaths.mjs'
import { DOMAIN_LABELS } from './lib/impactMap.mjs'
import { planReview } from './lib/orchestrate.mjs'
import { assertExplicitComplexFlag } from './lib/panels.mjs'
import { parseFlags, requirePositiveInt } from './lib/cliArgs.mjs'

async function main() {
  const { flags } = parseFlags(process.argv.slice(2))
  if (!flags.pr) {
    console.error('usage: npm run review:plan -- --pr <number> [--complex] [--json]')
    process.exit(1)
  }
  const pr = requirePositiveInt(flags, 'pr')
  const complex = assertExplicitComplexFlag(flags.complex)

  const plan = await planReview({ pr, complex, repoRoot: process.cwd() })

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          pr: plan.prInfo.pr,
          title: plan.prInfo.title,
          url: plan.prInfo.url,
          headSha: plan.prInfo.headSha,
          baseSha: plan.prInfo.baseSha,
          baseRefName: plan.prInfo.baseRefName,
          diffDigest: plan.prInfo.diffDigest,
          files: plan.prInfo.files,
          impact: plan.impact,
          panel: plan.panel,
          reviewers: plan.panel.reviewers.map((entry) => ({
            ...entry,
            binary: describeReviewerBin(entry.reviewer),
          })),
          contextPaths: plan.contextPaths,
          domainLabels: DOMAIN_LABELS,
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(`PR #${plan.prInfo.pr}: ${plan.prInfo.title}`)
  console.log(`Head SHA : ${plan.prInfo.headSha}`)
  console.log(`Base     : ${plan.prInfo.baseRefName} @ ${plan.prInfo.baseSha}`)
  console.log(`Diff     : ${plan.prInfo.files.length} files, digest ${plan.prInfo.diffDigest.slice(0, 16)}…`)
  console.log(`Scope    : ${plan.impact.breadth} — ${plan.impact.rationale}`)
  console.log(`Panel    : ${plan.panel.kind} (${plan.panel.note})`)
  console.log('')
  for (const entry of plan.panel.reviewers) {
    const bin = describeReviewerBin(entry.reviewer)
    console.log(`  - ${entry.label}: ${bin.command} (model: ${entry.model}, binary from ${bin.source})`)
  }
  console.log('')
  console.log('Context files sent alongside the diff:')
  for (const path of plan.contextPaths) console.log(`  - ${path}`)
  if (plan.impact.untrustedContextPaths.length > 0) {
    console.log('')
    console.log('Untrusted approval-shaped paths in the diff (excluded from context):')
    for (const path of plan.impact.untrustedContextPaths) console.log(`  - ${path}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
