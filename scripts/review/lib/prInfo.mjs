// PR inspection via the gh CLI. Read-only: view + diff only.
//
// The exact head SHA captured here is the anchor for the whole review: the
// prompt requires reviewers to restate it, verdicts must match it, and
// publishing re-fetches it and rejects if the PR moved.
//
// The BASE is read as the LIVE branch head (`gh api .../branches/<name>`),
// never from the PR record: `pulls/<n>.base.sha` and GraphQL `baseRefOid` are
// the merge snapshot GitHub last computed for the PR — observed stale
// (7c92d5a) while the branch had already advanced (d7d9ec1). A Ref's target
// is the commit the branch currently points at (GitHub GraphQL docs, `Ref`
// object), and the REST branch endpoint returns the same fact; that is the
// commit a review must be pinned against.
//
// Capture is atomic: head AND live base are read before the diff is pulled
// and re-read after — any movement in between voids the capture (PR_MOVED)
// instead of reviewing a diff stitched from two states. `run` is injected so
// tests never touch the network.

import { createHash } from 'node:crypto'

export const PR_VIEW_FIELDS = 'number,headRefOid,headRefName,baseRefOid,baseRefName,title,url'

const SHA_RE = /^[0-9a-f]{40}$/

async function fetchPrView({ pr, run }) {
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

// Reads the commit the base branch currently points at. `gh api` substitutes
// the {owner}/{repo} placeholders from the checked-out repo; the branch name
// is percent-encoded so slashed branch names stay one path segment.
export async function fetchLiveBaseHead({ branch, run, ownerRepo = '{owner}/{repo}' }) {
  let raw
  try {
    raw = await run('gh', ['api', `repos/${ownerRepo}/branches/${encodeURIComponent(branch)}`, '--jq', '.commit.sha'])
  } catch (error) {
    throw new Error(`gh api branches/${branch} failed: ${error.message}`)
  }
  const sha = String(raw ?? '').trim()
  if (!SHA_RE.test(sha)) {
    throw new Error(`branch API returned a malformed head for "${branch}": ${JSON.stringify(String(raw ?? '').trim().slice(0, 64))}`)
  }
  return sha
}

// One anchor read: the PR record plus the live base branch head.
async function fetchAnchor({ pr, run }) {
  const view = await fetchPrView({ pr, run })
  const liveBaseSha = await fetchLiveBaseHead({ branch: view.baseRefName, run })
  return { view, liveBaseSha }
}

export async function collectPrInfo({ pr, run }) {
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error(`--pr must be a positive integer, got: ${pr}`)
  }

  // 1. Anchor: head + live base before touching the diff.
  const before = await fetchAnchor({ pr, run })

  // 2. Diff + changed files, bound to the anchor by the re-check below.
  const changedFiles = parseChangedFiles(
    await runOrThrowWith(run, 'gh', ['pr', 'diff', String(pr), '--name-only'], pr),
  )
  if (changedFiles.length === 0) {
    throw new Error(`PR #${pr} reports no changed files; refusing to plan an empty review`)
  }
  const diffText = await runOrThrowWith(run, 'gh', ['pr', 'diff', String(pr)], pr)

  // 3. Re-fetch the anchor. Any movement means the diff above may have been
  //    produced across two states — fail loudly. The PR's own base snapshot
  //    is tracked too: it moving without the branch moving still means the
  //    review target changed.
  const after = await fetchAnchor({ pr, run })
  if (
    after.view.headRefOid !== before.view.headRefOid ||
    after.view.baseRefOid !== before.view.baseRefOid ||
    after.liveBaseSha !== before.liveBaseSha
  ) {
    const error = new Error(
      `PR #${pr} moved while its diff was being captured ` +
        `(head ${before.view.headRefOid.slice(0, 8)}→${after.view.headRefOid.slice(0, 8)}, ` +
        `base ${before.liveBaseSha.slice(0, 8)}→${after.liveBaseSha.slice(0, 8)}). ` +
        'Re-run the review against the new state.',
    )
    error.code = 'PR_MOVED'
    throw error
  }

  return {
    pr: before.view.number,
    headSha: before.view.headRefOid,
    headRefName: before.view.headRefName,
    // The commit the reviewed diff must apply to: the LIVE branch head.
    baseSha: before.liveBaseSha,
    baseRefName: before.view.baseRefName,
    // What the PR record itself reports (the merge snapshot). Recorded for
    // provenance; deliberately NOT used as the review base.
    baseSnapshotSha: before.view.baseRefOid,
    title: before.view.title,
    url: before.view.url ?? null,
    files: changedFiles,
    diffText,
    diffDigest: diffDigest(diffText),
  }
}

// Re-reads just the current refs. Publish paths call this immediately before
// any write so a PR that moved after the review rejects instead of
// mislabeling. The base is the LIVE branch head — the PR's base snapshot can
// stay frozen while main advances, which is exactly the drift this check
// exists to catch.
export async function fetchCurrentPrRefs({ pr, run }) {
  const view = await fetchPrView({ pr, run })
  const liveBaseSha = await fetchLiveBaseHead({ branch: view.baseRefName, run })
  return { headRefOid: view.headRefOid, baseRefOid: liveBaseSha, baseRefName: view.baseRefName }
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
