// Head/H1/summary copy for the two AV-Depot draft pages, verbatim from the
// handoff v2 front matter, H1 and "Kurz gesagt" paragraphs (Stand
// 2026-11-07); only the title brand suffix follows the RentenWiki.de rule.
// The years and dates are fixed facts (AVD start 2027, BGBl. 2026, date of
// the provider check), not rule-year copy, so they must not roll with
// RULES_YEAR. They live here rather than in publicRouteRegistry.ts so the
// registry's rule-year freshness scan stays strict for the copy it owns.

export const AVD_ANBIETER_PAGE_COPY = {
  title: 'Altersvorsorgedepot Anbieter 2027: Kosten & Status im Vergleich | RentenWiki.de',
  metaDescription:
    'AV-Depot-Anbieter 2027 im Vergleich: Status, Kosten laut Anbieter und Produktarten von ' +
    'Trade Republic, ING, Scalable, Deka u. a. Ohne Ranking. Mit Quellen.',
  h1: 'Altersvorsorgedepot-Anbieter 2027 im Vergleich: Kosten, Status, Quellen',
  summary:
    'Ab dem 1. Januar 2027 kannst du ein gefördertes Altersvorsorgedepot (AV-Depot) abschließen. ' +
    'Zum Stand 07.11.2026 ist noch kein Angebot abschließbar, denn jedes Produkt muss vorher ' +
    'zertifiziert werden. Unsere Übersicht zeigt 84 Anbieter, die eine Warteliste führen, ein ' +
    'Angebot angekündigt haben oder als möglicher Anbieter genannt werden. Für jeden Anbieter ' +
    'nennen wir den Stand, die Kosten laut Anbieter und die Quelle. Wir bewerten und rangieren ' +
    'keine Anbieter.',
} as const

export const AVD_GESETZ_PAGE_COPY = {
  title: 'Altersvorsorgedepot-Gesetz: Was ab 1.1.2027 gilt | RentenWiki.de',
  metaDescription:
    'Altersvorsorgereformgesetz (BGBl. 2026 I Nr. 156) erklärt: Zeitplan, Förderung, ' +
    'Standarddepot, Garantie, Auszahlung, Riester-Übertrag. AV-Depot ab 2027.',
  h1: 'Altersvorsorgedepot-Gesetz 2027 verständlich erklärt',
  summary:
    'Das Altersvorsorgereformgesetz reformiert ab dem 1. Januar 2027 die staatlich geförderte ' +
    'private Altersvorsorge (bisher Riester). Erstmals werden auch Depots mit Fonds und ETFs ' +
    'ohne Garantie gefördert: das Altersvorsorgedepot (AV-Depot). Der Staat zahlt bis zu 540 Euro ' +
    'Grundzulage und bis zu 300 Euro Kinderzulage je Kind im Jahr. Das Gesetz ist am 29.05.2026 ' +
    'im Bundesgesetzblatt verkündet worden. Einige Details, etwa Verordnungen und die ' +
    'Zertifizierung der Produkte, sind noch offen.',
} as const
