import { describe, expect, it } from 'vitest'

import {
  collectPrInfo,
  diffDigest,
  fetchCurrentHeadSha,
  fetchCurrentPrRefs,
  fetchLiveBaseHead,
} from './lib/prInfo.mjs'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
// The PR record's frozen merge snapshot — observed stale in the wild while
// the branch had already advanced.
const STALE_SNAPSHOT = '7'.repeat(40)

function viewJson({ head = HEAD, base = STALE_SNAPSHOT, omitHead = false, omitBase = false } = {}) {
  return JSON.stringify({
    number: 42,
    ...(omitHead ? {} : { headRefOid: head }),
    headRefName: 'codex/some-fix',
    ...(omitBase ? {} : { baseRefOid: base }),
    baseRefName: 'main',
    title: 'Fix BBG cap',
    url: 'https://github.com/PeterHartwieg/Rentenrechner/pull/42',
  })
}

// The PR view answers from a snapshot; the BASE is read from the live branch
// API (one call per anchor read). `liveBases` replays per-call answers.
function fakeGh({
  views = [viewJson()],
  liveBases = [BASE],
  branchApiFails = false,
  names = 'src/engine/tax.ts\nsrc/rules/de2026.ts\n',
  diff = 'diff --git a/src/engine/tax.ts\n+changed',
} = {}) {
  let viewCalls = 0
  let branchCalls = 0
  const calls = []
  const run = async (command, args) => {
    expect(command).toBe('gh')
    calls.push([command, ...args].join(' '))
    if (args[0] === 'pr' && args[1] === 'view') {
      const view = views[Math.min(viewCalls, views.length - 1)]
      viewCalls += 1
      return view
    }
    if (args[0] === 'api' && args[1]?.startsWith('repos/') && args.includes('.commit.sha')) {
      branchCalls += 1
      if (branchApiFails) throw new Error('exit status 1')
      return `${liveBases[Math.min(branchCalls - 1, liveBases.length - 1)]}\n`
    }
    if (args[0] === 'pr' && args[1] === 'diff' && args.includes('--name-only')) return names
    if (args[0] === 'pr' && args[1] === 'diff') return diff
    throw new Error(`unexpected gh invocation: ${args.join(' ')}`)
  }
  return Object.assign(run, { calls, branchCalls: () => branchCalls })
}

describe('collectPrInfo', () => {
  it('captures head AND base SHAs, changed files, and a stable diff digest', async () => {
    const run = fakeGh()
    const info = await collectPrInfo({ pr: 42, run })
    expect(info.headSha).toBe(HEAD)
    expect(info.baseSha).toBe(BASE)
    expect(info.files).toEqual(['src/engine/tax.ts', 'src/rules/de2026.ts'])
    expect(info.diffDigest).toBe(diffDigest('diff --git a/src/engine/tax.ts\n+changed'))
    expect(info.diffDigest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reviews against the LIVE branch head, not the PR base snapshot', async () => {
    // This is the exact shape observed on PR #391: baseRefOid pinned 7c92d5a
    // while main had already advanced to d7d9ec1.
    const run = fakeGh({ views: [viewJson({ base: STALE_SNAPSHOT })], liveBases: [BASE] })
    const info = await collectPrInfo({ pr: 42, run })
    expect(info.baseSha).toBe(BASE)
    expect(info.baseSnapshotSha).toBe(STALE_SNAPSHOT)
    // The base really came from the branch API, not the view.
    expect(run.calls.some((call) => call.includes('branches/main'))).toBe(true)
    expect(info.baseRefName).toBe('main')
  })

  it('percent-encodes slashed base branch names in the branch API path', async () => {
    const run = fakeGh({ views: [viewJson()], liveBases: [BASE] })
    await collectPrInfo({ pr: 42, run })
    expect(run.calls.some((call) => call.includes('branches/release%2F2026-09'))).toBe(false)
    expect(run.calls.filter((call) => /branches\//.test(call)).every((call) => call.includes('branches/main'))).toBe(
      true,
    )
  })

  it('rejects a non-integer PR number before touching gh', async () => {
    await expect(collectPrInfo({ pr: '42', run: fakeGh() })).rejects.toThrow(/--pr must be a positive integer/)
  })

  it('fails closed when the view is missing the head or base SHA', async () => {
    await expect(
      collectPrInfo({ pr: 42, run: fakeGh({ views: [viewJson({ omitBase: true })] }) }),
    ).rejects.toThrow(/missing "baseRefOid"/)
    await expect(
      collectPrInfo({ pr: 42, run: fakeGh({ views: [viewJson({ omitHead: true })] }) }),
    ).rejects.toThrow(/missing "headRefOid"/)
  })

  it('fails closed on a malformed SHA', async () => {
    await expect(
      collectPrInfo({ pr: 42, run: fakeGh({ views: [viewJson({ head: 'short' })] }) }),
    ).rejects.toThrow(/malformed headRefOid/)
  })

  it('fails closed on malformed view JSON', async () => {
    await expect(collectPrInfo({ pr: 42, run: fakeGh({ views: ['not json'] }) })).rejects.toThrow(/malformed JSON/)
  })

  it('fails closed when the PR reports no changed files', async () => {
    await expect(collectPrInfo({ pr: 42, run: fakeGh({ names: '' }) })).rejects.toThrow(/no changed files/)
  })

  it('wraps gh failures with the failing command', async () => {
    const failing = async () => {
      throw new Error('exit status 1')
    }
    await expect(collectPrInfo({ pr: 42, run: failing })).rejects.toThrow(/gh pr view failed for PR #42/)
  })

  it('fails closed when the branch API fails or answers with a malformed SHA', async () => {
    await expect(collectPrInfo({ pr: 42, run: fakeGh({ branchApiFails: true }) })).rejects.toThrow(
      /branches\/main failed/,
    )
    await expect(
      collectPrInfo({ pr: 42, run: fakeGh({ liveBases: ['d7d9ec1'] }) }),
    ).rejects.toThrow(/malformed head for "main"/)
  })
})

describe('collectPrInfo — atomic head/base capture around the diff', () => {
  it('rejects with PR_MOVED when the head moves while the diff is captured', async () => {
    // view #1 pins the anchor; view #2 (re-check after the diff) sees movement.
    const run = fakeGh({ views: [viewJson(), viewJson({ head: 'c'.repeat(40) })] })
    const error = await collectPrInfo({ pr: 42, run }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/moved while its diff was being captured/)
  })

  it('rejects with PR_MOVED when the PR base SNAPSHOT moves while the diff is captured', async () => {
    const run = fakeGh({ views: [viewJson(), viewJson({ base: 'd'.repeat(40) })] })
    const error = await collectPrInfo({ pr: 42, run }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/moved while its diff was being captured/)
  })

  it('rejects with PR_MOVED when the LIVE base advances while the diff is captured', async () => {
    // The failure that motivated the live-base change: the PR snapshot stays
    // frozen while main moves, so only the branch API can see the drift.
    const run = fakeGh({ views: [viewJson(), viewJson()], liveBases: [BASE, 'd'.repeat(40)] })
    const error = await collectPrInfo({ pr: 42, run }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/base [0-9a-f]{8}→[0-9a-f]{8}/)
  })

  it('accepts an unchanged anchor across the diff acquisition', async () => {
    const run = fakeGh({ views: [viewJson(), viewJson()], liveBases: [BASE, BASE] })
    const info = await collectPrInfo({ pr: 42, run })
    expect(info.headSha).toBe(HEAD)
    expect(info.baseSha).toBe(BASE)
  })
})

describe('fetchLiveBaseHead', () => {
  it('queries the branch ref and trims the returned SHA', async () => {
    let seen = null
    const run = async (command, args) => {
      expect(command).toBe('gh')
      seen = args
      return `${BASE}\n`
    }
    expect(await fetchLiveBaseHead({ branch: 'main', run })).toBe(BASE)
    expect(seen).toEqual(['api', 'repos/{owner}/{repo}/branches/main', '--jq', '.commit.sha'])
  })

  it('encodes a slashed branch name as one path segment', async () => {
    let seen = null
    const run = async (_command, args) => {
      seen = args
      return BASE
    }
    await fetchLiveBaseHead({ branch: 'release/2026-09', run })
    expect(seen[1]).toBe('repos/{owner}/{repo}/branches/release%2F2026-09')
  })
})

describe('fetchCurrentPrRefs / fetchCurrentHeadSha', () => {
  it('returns current head and the LIVE base SHA', async () => {
    const refs = await fetchCurrentPrRefs({ pr: 42, run: fakeGh({ views: [viewJson({ base: STALE_SNAPSHOT })] }) })
    expect(refs).toEqual({ headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main' })
    expect(await fetchCurrentHeadSha({ pr: 42, run: fakeGh() })).toBe(HEAD)
  })

  it('fails closed on a malformed head SHA', async () => {
    await expect(fetchCurrentHeadSha({ pr: 42, run: fakeGh({ views: [viewJson({ head: 'short' })] }) })).rejects.toThrow(
      /malformed headRefOid/,
    )
  })
})
