import { describe, expect, it } from 'vitest'

import { collectPrInfo, diffDigest, fetchCurrentHeadSha, fetchCurrentPrRefs } from './lib/prInfo.mjs'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

function viewJson({ head = HEAD, base = BASE, omitHead = false, omitBase = false } = {}) {
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

function fakeGh({ views = [viewJson()], names = 'src/engine/tax.ts\nsrc/rules/de2026.ts\n', diff = 'diff --git a/src/engine/tax.ts\n+changed' } = {}) {
  let viewCalls = 0
  return async (command, args) => {
    expect(command).toBe('gh')
    if (args[0] === 'pr' && args[1] === 'view') {
      const view = views[Math.min(viewCalls, views.length - 1)]
      viewCalls += 1
      return view
    }
    if (args[0] === 'pr' && args[1] === 'diff' && args.includes('--name-only')) return names
    if (args[0] === 'pr' && args[1] === 'diff') return diff
    throw new Error(`unexpected gh invocation: ${args.join(' ')}`)
  }
}

describe('collectPrInfo', () => {
  it('captures head AND base SHAs, changed files, and a stable diff digest', async () => {
    const info = await collectPrInfo({ pr: 42, run: fakeGh() })
    expect(info.headSha).toBe(HEAD)
    expect(info.baseSha).toBe(BASE)
    expect(info.files).toEqual(['src/engine/tax.ts', 'src/rules/de2026.ts'])
    expect(info.diffDigest).toBe(diffDigest('diff --git a/src/engine/tax.ts\n+changed'))
    expect(info.diffDigest).toMatch(/^[0-9a-f]{64}$/)
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
})

describe('collectPrInfo — atomic head/base capture around the diff', () => {
  it('rejects with PR_MOVED when the head moves while the diff is captured', async () => {
    // view #1 pins the anchor; view #2 (re-check after the diff) sees movement.
    const run = fakeGh({ views: [viewJson(), viewJson({ head: 'c'.repeat(40) })] })
    const error = await collectPrInfo({ pr: 42, run }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/moved while its diff was being captured/)
  })

  it('rejects with PR_MOVED when the BASE moves while the diff is captured', async () => {
    const run = fakeGh({ views: [viewJson(), viewJson({ base: 'd'.repeat(40) })] })
    const error = await collectPrInfo({ pr: 42, run }).catch((e) => e)
    expect(error.code).toBe('PR_MOVED')
    expect(error.message).toMatch(/base .*→/)
  })

  it('accepts an unchanged anchor across the diff acquisition', async () => {
    const run = fakeGh({ views: [viewJson(), viewJson()] })
    const info = await collectPrInfo({ pr: 42, run })
    expect(info.headSha).toBe(HEAD)
    expect(info.baseSha).toBe(BASE)
  })
})

describe('fetchCurrentPrRefs / fetchCurrentHeadSha', () => {
  it('returns current head and base SHAs', async () => {
    const refs = await fetchCurrentPrRefs({ pr: 42, run: fakeGh() })
    expect(refs).toEqual({ headRefOid: HEAD, baseRefOid: BASE })
    expect(await fetchCurrentHeadSha({ pr: 42, run: fakeGh() })).toBe(HEAD)
  })

  it('fails closed on a malformed head SHA', async () => {
    await expect(fetchCurrentHeadSha({ pr: 42, run: fakeGh({ views: [viewJson({ head: 'short' })] }) })).rejects.toThrow(
      /malformed headRefOid/,
    )
  })
})
