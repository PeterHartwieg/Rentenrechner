import { describe, expect, it } from 'vitest'
import {
  buildHomeOrganizationJsonLd,
  buildHomeWebApplicationJsonLd,
  buildHomeWebSiteJsonLd,
  ORG_EMAIL,
  ORG_LEGAL_NAME,
} from './organization'
import { buildCanonicalUrl, publicRouteRegistry } from './publicRouteRegistry'

// ---------------------------------------------------------------------------
// organization.ts — typed JSON-LD builders for the homepage's three blocks.
// Issue #03.
//
// These tests pin the locked decisions:
//   - Organization: name + legalName + url + email + founder; NO address.
//   - WebSite: name + url + inLanguage; NO potentialAction (no site search).
//   - WebApplication: matches the registry's `/` entry exactly so visible
//     content lines up with structured data per Google's guidelines.
// ---------------------------------------------------------------------------

// schema-dts emits deeply discriminated union types. The runtime objects we
// author are plain JSON, so tests cast through `unknown` for assertions —
// mirrors the pattern used in routeHead.test.ts.
type AnyRecord = Record<string, unknown>

describe('buildHomeOrganizationJsonLd — locked field set', () => {
  const canonical = buildCanonicalUrl('/')
  const data = buildHomeOrganizationJsonLd(canonical) as unknown as AnyRecord

  it('uses the public RentenWiki.de brand name', () => {
    expect(data.name).toBe('RentenWiki.de')
  })

  it('legalName is the Impressum sole-proprietorship name', () => {
    expect(data.legalName).toBe('Peter Hartwieg')
    expect(data.legalName).toBe(ORG_LEGAL_NAME)
  })

  it('url is the canonical homepage URL', () => {
    expect(data.url).toBe(canonical)
    expect(data.url).toBe('https://rentenwiki.de/')
  })

  it('email matches the Impressum contact', () => {
    expect(data.email).toBe('peter@hartwieg.com')
    expect(data.email).toBe(ORG_EMAIL)
  })

  it('founder is a Person with name + email (matches Impressum Anbieter)', () => {
    expect(data.founder).toBeDefined()
    const founder = data.founder as AnyRecord
    expect(founder['@type']).toBe('Person')
    expect(founder.name).toBe('Peter Hartwieg')
    expect(founder.email).toBe('peter@hartwieg.com')
  })

  it('omits `address` (decision pinned in #03 — §5 TMG vs SEO surface)', () => {
    // The Impressum publishes a postal address because §5 TMG requires it.
    // SEO has no local-business use case for RentenWiki.de (PRD line 154),
    // and machine-extractable exposure of a personal residential address
    // widens the scraping surface unnecessarily. Regression test pins the
    // omission so a future change is forced to update the comment near the
    // builder along with the test.
    expect(data.address).toBeUndefined()
  })

  it('omits sameAs (no canonical social profiles to point at yet)', () => {
    expect(data.sameAs).toBeUndefined()
  })

  it('serialises to valid JSON', () => {
    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow()
  })
})

describe('buildHomeWebSiteJsonLd — locked field set', () => {
  const canonical = buildCanonicalUrl('/')
  const data = buildHomeWebSiteJsonLd(canonical) as unknown as AnyRecord

  it('uses the public RentenWiki.de brand name', () => {
    expect(data.name).toBe('RentenWiki.de')
  })

  it('url is the canonical homepage URL', () => {
    expect(data.url).toBe(canonical)
  })

  it('inLanguage is de-DE (matches <html lang>)', () => {
    expect(data.inLanguage).toBe('de-DE')
  })

  it('omits potentialAction (no public site search yet)', () => {
    expect(data.potentialAction).toBeUndefined()
  })
})

describe('buildHomeWebApplicationJsonLd — visible-content alignment', () => {
  const entry = publicRouteRegistry['/']
  const canonical = buildCanonicalUrl('/')
  const data = buildHomeWebApplicationJsonLd({
    canonical,
    title: entry.title,
    summary: entry.summary,
    dateModified: entry.dateModified,
  }) as unknown as AnyRecord

  it('@type is WebApplication', () => {
    expect(data['@type']).toBe('WebApplication')
  })

  it('name + description + url + inLanguage + dateModified match the registry', () => {
    expect(data.name).toBe(entry.title)
    expect(data.description).toBe(entry.summary)
    expect(data.url).toBe(canonical)
    expect(data.inLanguage).toBe('de-DE')
    expect(data.dateModified).toBe(entry.dateModified)
  })

  it('applicationCategory is FinanceApplication', () => {
    expect(data.applicationCategory).toBe('FinanceApplication')
  })

  it('operatingSystem is Web', () => {
    expect(data.operatingSystem).toBe('Web')
  })

  it('offers reflects the free / public nature (€0)', () => {
    const offers = data.offers as AnyRecord
    expect(offers['@type']).toBe('Offer')
    expect(offers.price).toBe('0')
    expect(offers.priceCurrency).toBe('EUR')
  })
})
