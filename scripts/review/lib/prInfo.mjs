// PR inspection via the gh CLI. Read-only: view + diff only.
//
// The exact head SHA captured here is the anchor for the whole review: the
// prompt requires reviewers to restate it, verdicts must match it, and
// publishing re-fetches it and rejects if the PR moved.
//
// Capture is atomic: head AND base SHAs are read before the diff is pulled,
// and re-read after — any movement in between voids the capture (PR_MOVED)
// instead of reviewing a diff stitched from two states. `run` is injected so
// tests never touch the network.

import { createHash } from 'node:crypto'

export const PR_VIEW_FIELDS = 'number,headRefOid,headRefName,baseRefOid,baseRefName,title,url'

const SHA_RE = /^[0-9a-f]{40}$/

async function fetchPrRefs({ pr, run }) {
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
  for (const field of ['number', 'headRefOid', 'headRefName', 'baseRefOid', 'baseRefName', 'title']) {
    if (view[field] === undefined || view[field] === null || view[field] === '') {
      throw new Error(`gh pr view output missing "${field}" for PR #${pr}`)
    }
  }
  for (const field of ['headRefOid', 'baseRefOid']) {
    if (!SHA_RE.test(view[field])) {
      throw new Error(`gh pr view returned a malformed ${field} for PR #${pr}`)
    }
  }
  return view
}

export async function collectPrInfo({ pr, run }) {
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error(`--pr must be a positive integer, got: ${pr}`)
  }

  // 1. Anchor: head + base before touching the diff.
  const before = await fetchPrRefs({ pr, run })

  // 2. Diff + changed files, bound to the anchor by the re-check below.
  const changedFiles = parseChangedFiles(
    await runOrThrowWith(run, 'gh', ['pr', 'diff', String(pr), '--name-only'], pr),
  )
  if (changedFiles.length === 0) {
    throw new Error(`PR #${pr} reports no changed files; refusing to plan an empty review`)
  }
  const diffText = await runOrThrowWith(run, 'gh', ['pr', 'diff', String(pr)], pr)

  // 3. Re-fetch the anchor. Any movement means the diff above may have been
  //    produced across two states of the PR — fail loudly.
  const after = await fetchPrRefs({ pr, run })
  if (after.headRefOid !== before.headRefOid || after.baseRefOid !== before.baseRefOid) {
    const error = new Error(
      `PR #${pr} moved while its diff was being captured ` +
        `(head ${before.headRefOid.slice(0, 8)}→${after.headRefOid.slice(0, 8)}, ` +
        `base ${before.baseRefOid.slice(0, 8)}→${after.baseRefOid.slice(0, 8)}). ` +
        'Re-run the review against the new state.',
    )
    error.code = 'PR_MOVED'
    throw error
  }

  return {
    pr: before.number,
    headSha: before.headRefOid,
    headRefName: before.headRefName,
    baseSha: before.baseRefOid,
    baseRefName: before.baseRefName,
    title: before.title,
    url: before.url ?? null,
    files: changedFiles,
    diffText,
    diffDigest: diffDigest(diffText),
  }
}

// Re-reads just the current refs. Publish paths call this immediately before
// any write so a PR that moved after the review rejects instead of
// mislabeling.
export async function fetchCurrentPrRefs({ pr, run }) {
  const view = await fetchPrRefs({ pr, run })
  return { headRefOid: view.headRefOid, baseRefOid: view.baseRefOid }
}

// Back-compat single-field helper used by tests and error paths.
export async function fetchCurrentHeadSha({ pr, run }) {
  return (await fetchCurrentPrRefs({ pr, run })).headRefOid
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
