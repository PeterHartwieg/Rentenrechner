// PR inspection via the gh CLI. Read-only: view + diff only.
//
// The exact head SHA captured here is the anchor for the whole review: the
// prompt requires reviewers to restate it, verdicts must match it, and
// publishing re-fetches it and rejects if the PR moved. `run` is injected so
// tests never touch the network.

import { createHash } from 'node:crypto'

export const PR_VIEW_FIELDS = 'number,headRefOid,headRefName,baseRefName,title,url'

export async function collectPrInfo({ pr, run }) {
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error(`--pr must be a positive integer, got: ${pr}`)
  }

  let viewRaw
  try {
    viewRaw = await run('gh', ['pr', 'view', String(pr), '--json', PR_VIEW_FIELDS])
  } catch (error) {
    throw new Error(`gh pr view failed for PR #${pr}: ${error.message}`)
  }

  let view
  try {
    view = JSON.parse(viewRaw)
  } catch {
    throw new Error(`gh pr view returned malformed JSON for PR #${pr}`)
  }

  // Fail closed on any missing field: a partial view is not a review anchor.
  for (const field of ['number', 'headRefOid', 'headRefName', 'baseRefName', 'title']) {
    if (view[field] === undefined || view[field] === null || view[field] === '') {
      throw new Error(`gh pr view output missing "${field}" for PR #${pr}`)
    }
  }

  const changedFiles = parseChangedFiles(
    await runOrThrowWith(run, 'gh', ['pr', 'diff', String(pr), '--name-only'], pr),
  )
  if (changedFiles.length === 0) {
    throw new Error(`PR #${pr} reports no changed files; refusing to plan an empty review`)
  }

  const diffText = await runOrThrowWith(run, 'gh', ['pr', 'diff', String(pr)], pr)

  return {
    pr: view.number,
    headSha: view.headRefOid,
    headRefName: view.headRefName,
    baseRefName: view.baseRefName,
    title: view.title,
    url: view.url ?? null,
    files: changedFiles,
    diffText,
    diffDigest: diffDigest(diffText),
  }
}

// Re-reads just the head SHA. Publish paths call this immediately before any
// write so a PR that moved after the review rejects instead of mislabeling.
export async function fetchCurrentHeadSha({ pr, run }) {
  let view
  try {
    view = JSON.parse(await run('gh', ['pr', 'view', String(pr), '--json', 'headRefOid']))
  } catch (error) {
    throw new Error(`gh pr view failed while re-fetching head SHA for PR #${pr}: ${error.message}`)
  }
  if (!view || typeof view.headRefOid !== 'string' || !/^[0-9a-f]{40}$/.test(view.headRefOid)) {
    throw new Error(`gh pr view returned no usable headRefOid for PR #${pr}`)
  }
  return view.headRefOid
}

function parseChangedFiles(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

async function runOrThrowWith(run, command, args, pr) {
  try {
    return await run(command, args)
  } catch (error) {
    throw new Error(`${command} ${args.join(' ')} failed for PR #${pr}: ${error.message}`)
  }
}

export function diffDigest(diffText) {
  return createHash('sha256').update(diffText, 'utf8').digest('hex')
}
