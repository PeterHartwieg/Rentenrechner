/**
 * German copy templates for recommendation atoms.
 *
 * Pure module — no React imports, no DOM access.
 *
 * Each atom id in `AtomId` maps to a template function in `ATOM_TEMPLATES`.
 * `renderAtom` is the public entry point: given an `Atom`, it returns
 * `{ headline, body, cta? }`.
 *
 * Locale is reserved for P2 bilingual support; only `'de'` is implemented today.
 *
 * Context-accessor helpers (`ctxString`, `ctxNumber`) are co-located here
 * because they are exclusively used by copy templates.
 */

import type { Atom, AtomId } from '../app/recommendations'

// ---------------------------------------------------------------------------
// Context accessor helpers
// ---------------------------------------------------------------------------

export function ctxString(ctx: Record<string, unknown>, key: string): string {
  const value = ctx[key]
  if (typeof value !== 'string') {
    if (import.meta.env?.DEV) {
      console.warn(`[recommendations] missing/invalid string context key '${key}'`, ctx)
    }
    return ''
  }
  return value
}

export function ctxNumber(ctx: Record<string, unknown>, key: string): number {
  const value = ctx[key]
  if (typeof value !== 'number') {
    if (import.meta.env?.DEV) {
      console.warn(`[recommendations] missing/invalid number context key '${key}'`, ctx)
    }
    return 0
  }
  return value
}

function ctxBool(ctx: Record<string, unknown>, key: string): boolean {
  return ctx[key] === true
}

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export interface AtomTemplate {
  headline: string
  body: string
  cta?: string
}

// ---------------------------------------------------------------------------
// Template table — German copy for every atom id
// ---------------------------------------------------------------------------

const ATOM_TEMPLATES: Record<AtomId, (atom: Atom) => AtomTemplate> = {
  sensitivity_rankings_disagree: (atom) => {
    const capLabel = ctxString(atom.context, 'bestCapitalLabel')
    const penLabel = ctxString(atom.context, 'bestPensionLabel')
    return {
      headline: 'Kapital- und Renten-Sieger sind verschieden',
      body: `„${capLabel}" vorn beim Kapital, „${penLabel}" bei der monatlichen Rente. Frage dich, was dir wichtiger ist.`,
    }
  },

  sensitivity_narrow_capital_gap: (atom) => {
    const runnerLabel = ctxString(atom.context, 'runnerLabel')
    return {
      headline: 'Knapper Vorsprung beim Kapital',
      body: `Unter 5 % zu „${runnerLabel}". Ranking kippt schon bei kleinen Änderungen an Rendite oder Gebühren.`,
    }
  },

  sensitivity_high_fee_winner: (atom) => {
    const riy = ctxNumber(atom.context, 'riyDecimal')
    return {
      headline: 'Sieger hat hohe Effektivkosten',
      body: `${(riy * 100).toFixed(2)} % p. a. Eine Renditeannahme 1 pp niedriger oder ein günstigerer Tarif kann das Bild drehen.`,
    }
  },

  sensitivity_default: (atom) => {
    const text = ctxString(atom.context, 'text') || 'Hebel mit grösstem Einfluss: Rendite, Effektivkosten und (bei bAV) Arbeitgeberanteil. Verändere sie testweise im Bereich „Erweitert".'
    return {
      headline: 'Vergleichshinweis',
      body: text,
    }
  },

  reason_employer_subsidy: () => ({
    headline: 'Hoher Arbeitgeberanteil',
    body: 'Hoher Arbeitgeberanteil senkt deinen Nettoaufwand.',
  }),

  reason_low_fees: () => ({
    headline: 'Niedrige Gebühren',
    body: 'Niedrige Gebühren, jederzeit frei verfügbar.',
  }),

  reason_high_fees: (atom) => {
    const productId = ctxString(atom.context, 'productId')
    if (productId === 'basisrente') {
      return {
        headline: 'Hohe Kosten und kein Kapitalwahlrecht',
        body: 'Hohe Vertragskosten und kein Kapitalwahlrecht.',
      }
    }
    if (productId === 'versicherung') {
      return {
        headline: 'Hohe Vertragskosten',
        body: 'Hohe Vertragskosten — Effektivkosten über 1,2 % p. a.',
      }
    }
    return {
      headline: 'Hohe Vertragskosten',
      body: 'Vertragskosten zehren am Ergebnis (Effektivkosten hoch).',
    }
  },

  reason_tax_deferral: (atom) => {
    const productId = ctxString(atom.context, 'productId')
    if (productId === 'basisrente') {
      return {
        headline: 'Steuervorteil heute',
        body: 'Sonderausgabenabzug heute, Besteuerung in der Rente.',
      }
    }
    return {
      headline: 'Steuer- und SV-Ersparnis',
      body: 'Steuer- und SV-Ersparnis in der Ansparphase.',
    }
  },

  reason_flexible_capital: () => ({
    headline: 'Flexibel verfügbar',
    body: 'Frei verfügbar, kein Auszahlplan vorgegeben.',
  }),

  reason_subsidies: (atom) => {
    const productId = ctxString(atom.context, 'productId')
    if (productId === 'altersvorsorgedepot') {
      return {
        headline: 'Zulagen und Steuervorteil',
        body: 'Zulagen und Steuervorteil, gebunden bis Rentenbeginn.',
      }
    }
    if (productId === 'riester' && ctxBool(atom.context, 'hasEmployerContribution')) {
      return {
        headline: 'Zulagen',
        body: 'Zulagen und ggf. zusätzlicher Steuervorteil.',
      }
    }
    return {
      headline: 'Zulagen',
      body: 'Grund- und Kinderzulagen, volle Versteuerung in der Rente.',
    }
  },

  reason_guarantee: () => ({
    headline: 'Rentengarantie',
    body: 'Lebenslange Rentengarantie über den Rentenfaktor.',
  }),

  // ---------------------------------------------------------------------------
  // Cap and headroom atoms
  // ---------------------------------------------------------------------------

  bav_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const remainingMonthly = ctxNumber(atom.context, 'remainingMonthly')
    const nextLever = ctxString(atom.context, 'nextLeverProductId')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des steuerfreien bAV-Rahmens (§ 3 Nr. 63 EStG). `
    if (remainingMonthly > 0) {
      body += `Noch ${Math.round(remainingMonthly)} €/Monat verfügbar.`
    } else {
      body += 'Der steuerfreie Rahmen ist ausgeschöpft.'
    }
    if (nextLever === 'basisrente') {
      body += ' Nächster Hebel: Rürup-Rente — ebenfalls Sonderausgabenabzug, ohne bAV-Bindung.'
    }
    return {
      headline: 'Betriebliche Altersvorsorge: Beitragslimit',
      body,
    }
  },

  basisrente_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const remainingAnnual = ctxNumber(atom.context, 'remainingAnnual')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des Schicht-1-Höchstbetrags (§ 10 Abs. 3 EStG). `
    if (remainingAnnual > 0) {
      body += `Noch ${Math.round(remainingAnnual)} €/Jahr für Rürup-Beiträge abzugsfähig.`
    } else {
      body += 'Der Höchstbetrag ist durch GRV- und Rürup-Beiträge ausgeschöpft.'
    }
    return {
      headline: 'Rürup-Rente: Sonderausgabenrahmen',
      body,
    }
  },

  riester_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const topUpToCap = ctxNumber(atom.context, 'topUpToCap')
    const allowanceCovered = ctxNumber(atom.context, 'allowanceCovered')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des Riester-Höchstbetrags (§ 10a EStG, 2.100 €/Jahr inkl. Zulagen). `
    if (allowanceCovered > 0) {
      body += `Zulagen decken ${Math.round(allowanceCovered)} €/Jahr. `
    }
    if (topUpToCap > 0) {
      body += `Mit ${Math.round(topUpToCap)} € mehr Eigenbeitrag erreichst du den Höchstbetrag.`
    }
    return {
      headline: 'Riester: Sonderausgabenrahmen',
      body,
    }
  },

  avd_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const remainingMonthly = ctxNumber(atom.context, 'remainingMonthly')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des AVD-Vertragsrahmens (6.840 €/Jahr). `
    if (remainingMonthly > 0) {
      body += `Noch ${Math.round(remainingMonthly)} €/Monat Spielraum bis zur Vertragsobergrenze.`
    } else {
      body += 'Die jährliche Vertragsobergrenze ist ausgeschöpft.'
    }
    return {
      headline: 'Altersvorsorgedepot: Beitragslimit',
      body,
    }
  },

  sparerpauschbetrag_remaining: (atom) => {
    const usedAnnual = ctxNumber(atom.context, 'usedAnnual')
    const remainingAnnual = ctxNumber(atom.context, 'remainingAnnual')
    const married = atom.context['married'] === true
    const cap = married ? 2_000 : 1_000
    let body = `Sparerpauschbetrag ${married ? '(verheiratet, 2.000 €)' : '(ledig, 1.000 €)'}: `
    if (usedAnnual > 0) {
      body += `${Math.round(usedAnnual)} € genutzt, noch ${Math.round(remainingAnnual)} € frei.`
    } else {
      body += `${cap} € noch nicht genutzt — ETF- und AVD-Vorabpauschale werden hier angerechnet.`
    }
    return {
      headline: 'Sparerpauschbetrag',
      body,
    }
  },

  // ---------------------------------------------------------------------------
  // Vintage-detection atoms
  // ---------------------------------------------------------------------------

  pre_2005_pav_taxfree_capital: () => ({
    headline: 'Pre-2005-Kapitalauszahlung steuerfrei (§52 Abs. 28 EStG a.F.)',
    body:
      'Dein Vertrag erfüllt die Bedingungen für die steuerfreie Kapitalauszahlung nach §52 Abs. 28 EStG a.F. ' +
      '(Vertragsbeginn vor 2005, Laufzeit ≥ 12 Jahre). Der Rechner wendet diese Befreiung automatisch an. ' +
      'Achtung — bei Leibrente-Auszahlung gilt §22 Nr. 1 Satz 3 a EStG Ertragsanteil auch für pre-2005-Verträge.',
  }),

  halbeinkuenfte_pav_eligible: () => ({
    headline: 'Halbeinkünfte (halbe Steuer auf Gewinn) — §20 Abs. 1 Nr. 6 EStG',
    body:
      'Dein Vertrag erfüllt die Bedingungen für das Halbeinkünfteverfahren bei Kapitalauszahlung ' +
      '(Vertragsbeginn ab 2005, Laufzeit ≥ 12 Jahre, Auszahlung ab Alter 62). ' +
      'Nur die Hälfte des Gewinns wird mit dem persönlichen Steuersatz besteuert — §20 Abs. 1 Nr. 6 EStG.',
  }),

  pre_2005_pav_high_garantiezins: () => ({
    headline: 'Hoher Garantiezins (4 % bis 2024 auf Beiträge)',
    body:
      'Verträge aus 2003 oder früher haben einen Höchstrechnungszins von 4 % p. a. auf die Sparanteile. ' +
      'Dieser Zins ist heute kaum noch am Markt erhältlich. In Kombination mit der steuerfreien ' +
      'Kapitalauszahlung (pre-2005) ist das ein starkes Argument, diesen Vertrag zu behalten.',
  }),

  bav_40b_alt_eligible: () => ({
    headline: 'Pre-2005 §40b-Direktversicherung — Kapitalauszahlung steuerfrei (KV/PV bleibt)',
    body:
      'Dieser bAV-Vertrag wurde vom Arbeitgeber pauschal nach §40b EStG a.F. besteuert. ' +
      'Da alle Voraussetzungen (Vertragsabschluss vor 2005, Laufzeit ≥ 12 Jahre, mind. 5 Jahresprämien) ' +
      'erfüllt sind, ist die Kapitalauszahlung einkommensteuerfrei (§52 Abs. 28 EStG a.F.). ' +
      'KV/PV nach §229 Abs. 1 SGB V fällt weiterhin an — der Rechner berücksichtigt dies.',
  }),

  bav_40b_alt_conditions_unmet: () => ({
    headline: '§40b-Vertrag, aber Bedingungen nicht erfüllt — Lump-sum als Versorgungsbezug',
    body:
      'Obwohl der Durchführungsweg §40b EStG a.F. ist, sind die Voraussetzungen für die ' +
      'Steuerfreiheit nicht vollständig erfüllt. Die Kapitalauszahlung wird daher als ' +
      'Versorgungsbezug voll besteuert (§22 Nr. 5 EStG). Prüfe, ob alle Bedingungen tatsächlich ' +
      'nicht greifen, oder korrigiere den "Steuerfreiheit bestätigt"-Schalter im Vertrag.',
  }),

  bav_durchfuehrungsweg_direktzusage: () => ({
    headline: 'Lump-sum-Steuerung: Fünftelregelung (§34 EStG)',
    body:
      'Bei Direktzusage und Unterstützungskasse gilt die Kapitalauszahlung als Vergütung für ' +
      'mehrjährige Tätigkeit. Die Fünftelregelung (§34 Abs. 2 Nr. 4 EStG) glättet die ' +
      'Steuerprogression — der Rechner wendet dies automatisch an.',
  }),

  riester_pre_2008_zulage: () => ({
    headline: 'Kinderzulage für nach 2008 geborene Kinder ggf. nicht voll auf altem Riester — Vertragsanpassung prüfen',
    body:
      'Für Kinder, die ab 2008 geboren wurden, beträgt die Kinderzulage 300 EUR/Jahr (statt 185 EUR). ' +
      'Bei einem Riester-Vertrag aus 2007 oder früher muss der Vertrag beim Anbieter auf den ' +
      'neuen Kindzulagesatz angepasst werden. Prüfe mit deinem Anbieter, ob der höhere Satz bereits ' +
      'eingetragen ist.',
  }),

  // ---------------------------------------------------------------------------
  // Contract-decision candidate-effect atoms
  // ---------------------------------------------------------------------------

  lose_pre_2005_privilege: () => ({
    headline: 'Verlust von Altvertrag-Privilegien',
    body:
      'Diese Option beendet deinen Vertrag. Du verlierst dabei dauerhaft die steuerlichen Vorteile ' +
      'des Altvertrags (steuerfreie Kapitalauszahlung / Halbeinkünfteverfahren). ' +
      'Diese Privilegien können bei einem Neuabschluss nicht wiederhergestellt werden.',
  }),

  paid_up_high_fee_warning: (atom) => {
    const riy = ctxNumber(atom.context, 'riyDecimal')
    return {
      headline: 'Hohe Kosten im Beitragsfreistand',
      body:
        `Effektivkosten von ${(riy * 100).toFixed(2)} % p. a. bei beitragsfreiem Vertrag: ` +
        'Laufende Verwaltungskosten belasten das angesparte Kapital besonders stark, ' +
        'wenn keine neuen Beiträge mehr eingezahlt werden.',
    }
  },

  riester_to_avd_certified: () => ({
    headline: 'Steuerneutrale Übertragung möglich (AltZertG)',
    body:
      'Die Übertragung von Riester auf ein Altersvorsorgedepot ist nach AltZertG steuerneutral möglich. ' +
      'Zulagen und Sonderausgabenabzüge bleiben erhalten; der Anbieter organisiert die Übertragung. ' +
      'Prüfe, ob dein aktueller Anbieter die Übertragung gebührenfrei abwickelt.',
  }),

  funding_cap_hit: (atom) => {
    const capAnnualEUR = ctxNumber(atom.context, 'capAnnualEUR')
    const proposedAnnualEUR = ctxNumber(atom.context, 'proposedAnnualEUR')
    return {
      headline: 'Über dem gesetzlichen Förderdeckel',
      body:
        `Der vorgeschlagene Beitrag (${Math.round(proposedAnnualEUR).toLocaleString('de-DE')} €/Jahr) ` +
        `übersteigt den gesetzlichen Förderrahmen (${Math.round(capAnnualEUR).toLocaleString('de-DE')} €/Jahr). ` +
        'Beiträge oberhalb des Deckels sind zwar möglich, verlieren aber die steuerlichen Vorteile ' +
        '(z. B. §-3-Nr.-63-Befreiung bei bAV, Sonderausgabenabzug bei Rürup/Riester/AVD). ' +
        'Die Modellrechnung zeigt die Auswirkung — du entscheidest, ob der höhere Beitrag trotzdem sinnvoll ist.',
    }
  },
}

const FALLBACK_TEMPLATE: AtomTemplate = { headline: '', body: '', cta: undefined }

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Map an atom to its display strings via the static German template table.
 *
 * Unknown atom ids return a placeholder and warn in dev — never throws.
 *
 * `locale` is reserved for P2 bilingual support; only `'de'` is implemented today.
 */
export function renderAtom(atom: Atom, locale: 'de' = 'de'): AtomTemplate {
  void locale
  const templateFn = ATOM_TEMPLATES[atom.id]
  if (!templateFn) {
    if (import.meta.env?.DEV) {
      console.warn(`[recommendations] Unknown AtomId: "${atom.id}"`)
    }
    return FALLBACK_TEMPLATE
  }
  return templateFn(atom)
}
