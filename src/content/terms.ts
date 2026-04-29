/**
 * Central glossary of German retirement / tax terms used in the calculator.
 *
 * Each entry has:
 * - plainLabel: short user-friendly label (what we display in the UI)
 * - expertLabel: formal / legal term (what shows up in offer documents and statutes)
 * - shortHelp: one or two sentences answering "what does this mean for me?"
 * - legalReference: optional §-reference for users who want to dig further
 *
 * #UX2 — keep entries focused on what a non-expert user sees in this app.
 */

export interface Term {
  id: string
  plainLabel: string
  expertLabel: string
  shortHelp: string
  legalReference?: string
  category: TermCategory
}

export type TermCategory =
  | 'profile'
  | 'grv'
  | 'bav'
  | 'insurance'
  | 'basisrente'
  | 'foerderung'
  | 'auszahlung'
  | 'kosten'
  | 'steuer-sv'

export const CATEGORY_LABELS: Record<TermCategory, string> = {
  profile: 'Profil & Einkommen',
  grv: 'Gesetzliche Rente / Versorgung',
  bav: 'Betriebliche Altersvorsorge (bAV)',
  insurance: 'Private Rentenversicherung (pAV)',
  basisrente: 'Basisrente / Rürup',
  foerderung: 'Riester & Altersvorsorgedepot',
  auszahlung: 'Auszahlung & Renten­formen',
  kosten: 'Kosten & Gebühren',
  'steuer-sv': 'Steuern & Sozial­abgaben',
}

export const TERMS_LIST: Term[] = [
  // ─── Profile ──────────────────────────────────────────────────────────────
  {
    id: 'jahresbrutto',
    plainLabel: 'Jahresbrutto',
    expertLabel: 'Bruttojahresgehalt',
    shortHelp:
      'Dein gesamtes Bruttogehalt im Jahr (vor Lohnsteuer und Sozialabgaben). Basis für GRV-Beiträge, bAV-Grenzen und Vorsorgepauschalen.',
    category: 'profile',
  },
  {
    id: 'gkv-zusatzbeitrag',
    plainLabel: 'GKV-Zusatzbeitrag',
    expertLabel: 'Kassenindividueller Zusatzbeitrag',
    shortHelp:
      'Jede gesetzliche Krankenkasse erhebt zusätzlich zum allgemeinen Beitragssatz (14,6 %) einen eigenen Zusatzbeitrag — meist zwischen 1,5 % und 3,5 %.',
    category: 'profile',
  },
  {
    id: 'gkv-pkv',
    plainLabel: 'GKV vs. PKV',
    expertLabel: 'Gesetzliche / Private Krankenversicherung',
    shortHelp:
      'GKV ist beitragspflichtig nach Einkommen. PKV ist eine private Vollversicherung mit festen Prämien. Beeinflusst Lohnabzüge und Beiträge im Ruhestand.',
    category: 'profile',
  },

  // ─── GRV / Statutory pension ──────────────────────────────────────────────
  {
    id: 'entgeltpunkte',
    plainLabel: 'Entgeltpunkte (EP)',
    expertLabel: 'Entgeltpunkte / Renten­konten­punkte',
    shortHelp:
      'Punkte aus deinem Renten­konto bei der DRV. Pro Jahr mit Durchschnitts­einkommen gibt es ~1 EP. Stand siehst du in deiner Renten­information.',
    legalReference: '§63, §70 SGB VI',
    category: 'grv',
  },
  {
    id: 'aktueller-rentenwert',
    plainLabel: 'Aktueller Rentenwert',
    expertLabel: 'Aktueller Rentenwert',
    shortHelp:
      'Wert eines Entgeltpunkts in EUR/Monat. Wird jährlich angepasst. 2026 ≈ 40,79 EUR/EP. Bruttorente = EP × Rentenwert.',
    legalReference: '§68, §69 SGB VI',
    category: 'grv',
  },
  {
    id: 'renteninformation',
    plainLabel: 'Renteninformation',
    expertLabel: 'Renteninformation der DRV',
    shortHelp:
      'Jährliches Schreiben der Deutschen Renten­versicherung mit deinem aktuellen EP-Stand und einer Renten­prognose. Zugang über deinen DRV-Online-Account.',
    category: 'grv',
  },
  {
    id: 'versorgungswerk',
    plainLabel: 'Berufsständisches Versorgungs­werk',
    expertLabel: 'Versorgungswerk',
    shortHelp:
      'Pflicht­alters­versorgung für Kammer­berufe (Ärzte, Anwälte, Architekten, …) — ersetzt die GRV. Beiträge zählen wie GRV-Beiträge zur Schicht-1-Grenze.',
    category: 'grv',
  },
  {
    id: 'beamtenpension',
    plainLabel: 'Beamten­pension',
    expertLabel: 'Beamten­versorgung / Ruhegehalt',
    shortHelp:
      'Versorgung für Beamte: Prozentsatz vom letzten Grundgehalt (Ruhe­gehalts­satz, max. 71,75 %). Steuerlich behandelt als Versorgungs­bezug.',
    legalReference: 'Beamten­versorgungs­gesetz (BeamtVG)',
    category: 'grv',
  },

  // ─── bAV ─────────────────────────────────────────────────────────────────
  {
    id: 'entgeltumwandlung',
    plainLabel: 'Entgelt­umwandlung',
    expertLabel: 'Brutto-Entgelt­umwandlung in die bAV',
    shortHelp:
      'Du tauschst Brutto-Gehalt gegen einen bAV-Beitrag. In der Anspar­phase fällt darauf bis zu bestimmten Grenzen keine Lohnsteuer und keine Sozial­abgaben an. In der Renten­phase wird voll besteuert.',
    legalReference: '§3 Nr. 63 EStG, §1 BetrAVG',
    category: 'bav',
  },
  {
    id: 'gesetzlicher-ag-zuschuss',
    plainLabel: 'Gesetzlicher AG-Zuschuss',
    expertLabel: 'Gesetzlicher AG-Pflichtzuschuss',
    shortHelp:
      'Dein Arbeitgeber muss dir 15 % deines bAV-Beitrags dazu­geben — soweit er selbst Sozial­abgaben spart. Gilt für Verträge ab 2019; ältere Verträge ab 2022.',
    legalReference: '§1a Abs. 1a BetrAVG',
    category: 'bav',
  },
  {
    id: 'durchfuehrungsweg',
    plainLabel: 'bAV-Vertragsart',
    expertLabel: 'Durchführungs­weg',
    shortHelp:
      'Form der bAV: Direkt­versicherung, Pensions­kasse, Pensions­fonds, Direkt­zusage oder Unter­stützungs­kasse. Beeinflusst Steuer und Sozial­abgaben besonders bei Kapital­abfindung.',
    category: 'bav',
  },
  {
    id: 'direktversicherung',
    plainLabel: 'Direkt­versicherung',
    expertLabel: 'Direkt­versicherung (§3 Nr. 63 EStG)',
    shortHelp:
      'Häufigste bAV-Form: Lebens­versicherer ist Vertrags­partner, Arbeit­geber zahlt Beiträge ein. Beiträge bis 8 % BBG steuerfrei, bis 4 % BBG sozial­abgabenfrei.',
    category: 'bav',
  },
  {
    id: 'kvdr',
    plainLabel: 'Pflicht­versicherter Rentner (KVdR)',
    expertLabel: 'Krankenversicherung der Rentner (KVdR)',
    shortHelp:
      'Wer die 9/10-Regelung erfüllt (90 % der zweiten Erwerbs­hälfte gesetzlich versichert), bleibt im Ruhestand pflicht­versichert. Vorteil: Frei­betrag auf bAV-Renten und nur halbe KV-Sätze auf die GRV.',
    legalReference: '§5 Abs. 1 Nr. 11 SGB V, §226 SGB V',
    category: 'bav',
  },
  {
    id: 'grv-minderung',
    plainLabel: 'GRV-Minderung durch bAV',
    expertLabel: 'Reduktion gesetzlicher Renten­ansprüche',
    shortHelp:
      'Wenn du Brutto in bAV umwandelst, zahlst du auf diesen Betrag keine RV-Beiträge — also bekommst du später entsprechend weniger gesetzliche Rente.',
    category: 'bav',
  },

  // ─── Insurance / pAV ─────────────────────────────────────────────────────
  {
    id: 'pav-schicht-3',
    plainLabel: 'Private Renten­versicherung (Schicht 3)',
    expertLabel: 'Private Renten­versicherung Schicht 3',
    shortHelp:
      'Privat finanziert, kein Steuer­vorteil bei Einzahlung. Auszahlung mit Halbeinkünfte­verfahren oder Abgeltung­steuer; bei lebens­langer Rente nur Ertrags­anteil steuer­pflichtig.',
    legalReference: '§20 Abs. 1 Nr. 6 EStG',
    category: 'insurance',
  },
  {
    id: 'halbeinkuenfte',
    plainLabel: 'Halbeinkünfte­verfahren',
    expertLabel: 'Halbeinkünfte­verfahren',
    shortHelp:
      'Bei Kapital­auszahlung aus Verträgen ab 2005 mit Mindest­laufzeit 12 Jahren und Auszahlung ab Alter 62: nur die Hälfte der Erträge wird mit deinem persönlichen Steuersatz versteuert.',
    legalReference: '§20 Abs. 1 Nr. 6 EStG',
    category: 'insurance',
  },
  {
    id: 'ertragsanteil',
    plainLabel: 'Ertrags­anteil',
    expertLabel: 'Ertrags­anteils­besteuerung',
    shortHelp:
      'Bei lebens­langer Rente aus pAV ist nur ein vom Renten­beginn­alter abhängiger Anteil der Rente steuer­pflichtig (z. B. 17 % bei Renten­beginn 67).',
    legalReference: '§22 Nr. 1 Satz 3 a aa EStG',
    category: 'insurance',
  },
  {
    id: 'beitragsfreistellung',
    plainLabel: 'Beiträge ruhen lassen',
    expertLabel: 'Beitragsfreistellung',
    shortHelp:
      'Du stoppst die Beiträge, der Vertrag läuft aber bis zum Renten­beginn weiter. Sinnvoll, wenn du die Beiträge nicht mehr leisten willst, aber den Vertrag nicht kündigen möchtest.',
    category: 'insurance',
  },
  {
    id: 'stornoabschlag',
    plainLabel: 'Storno­abzug bei Kündigung',
    expertLabel: 'Storno­abschlag / Rückkaufs­wert-Reduktion',
    shortHelp:
      'Wer früh kündigt, bekommt nicht das volle Vertrags­kapital zurück: Versicherer ziehen einen Storno­abschlag ab — je nach Vertrag 5–25 %.',
    category: 'insurance',
  },

  // ─── Basisrente ──────────────────────────────────────────────────────────
  {
    id: 'basisrente',
    plainLabel: 'Basisrente / Rürup (Schicht 1)',
    expertLabel: 'Basisrente nach §10 Abs. 1 Nr. 2 EStG',
    shortHelp:
      'Privat finanzierte Renten­versicherung mit Steuer­vorteil bei Einzahlung. Kein Kapital­wahl­recht, lebens­lange Rente; nicht beleihbar oder vererb­bar (außer Hinterbliebenen).',
    legalReference: '§10 Abs. 1 Nr. 2 EStG',
    category: 'basisrente',
  },
  {
    id: 'schicht-1-cap',
    plainLabel: 'Schicht-1-Höchstbetrag',
    expertLabel: 'Schicht-1-Höchstbetrag',
    shortHelp:
      '2026 max. 30.826 EUR/Jahr (Single) bzw. 61.652 EUR (zusammen­veranlagt). GRV-/VW-Beiträge zählen darauf an. Nur Beiträge unterhalb der Grenze sind als Sonder­ausgaben absetzbar.',
    legalReference: '§10 Abs. 3 EStG',
    category: 'basisrente',
  },
  {
    id: 'besteuerungsanteil',
    plainLabel: 'Besteuerungs­anteil',
    expertLabel: 'Besteuerungs­anteil §22 Nr. 1 EStG',
    shortHelp:
      'Bei GRV / Versorgungs­werk / Basisrente: der steuer­pflichtige Teil deiner Brutto­rente — abhängig vom Renten­beginn­jahr. Steigt jährlich auf 100 % bis 2058.',
    legalReference: '§22 Nr. 1 Satz 3 a aa EStG',
    category: 'basisrente',
  },

  // ─── Riester / AVD ───────────────────────────────────────────────────────
  {
    id: 'guenstigerpruefung',
    plainLabel: 'Steuer-vs.-Zulage-Vergleich',
    expertLabel: 'Günstigerprüfung',
    shortHelp:
      'Das Finanzamt prüft automatisch, ob für dich die staatlichen Zulagen oder der Sonder­ausgaben­abzug der Beiträge günstiger ist — du bekommst die jeweils höhere Förderung.',
    legalReference: '§10a EStG',
    category: 'foerderung',
  },
  {
    id: 'mindesteigenbeitrag',
    plainLabel: 'Mindest­beitrag für volle Zulage',
    expertLabel: 'Mindest­eigen­beitrag',
    shortHelp:
      'Riester / AVD: 4 % deines rentenversicherungs­pflichtigen Vorjahres­einkommens minus Zulagen. Wer weniger zahlt, bekommt Zulagen nur anteilig.',
    legalReference: '§86 EStG',
    category: 'foerderung',
  },
  {
    id: 'grundzulage',
    plainLabel: 'Grundzulage',
    expertLabel: 'Grundzulage',
    shortHelp:
      '175 EUR/Jahr für jeden direkt förder­berechtigten Sparer (Riester / AVD). Mittel­bar Berechtigte (Ehegatte) bekommen sie über den eigenen Vertrag.',
    legalReference: '§84 EStG',
    category: 'foerderung',
  },
  {
    id: 'kinderzulage',
    plainLabel: 'Kinderzulage',
    expertLabel: 'Kinderzulage',
    shortHelp:
      '300 EUR/Jahr für Kinder, die ab 2008 geboren sind; 185 EUR für ältere Kinder. Wird einem Eltern­teil zugeordnet (Standardmäßig der Mutter).',
    legalReference: '§85 EStG',
    category: 'foerderung',
  },
  {
    id: 'berufseinsteiger-bonus',
    plainLabel: 'Berufs­einsteiger-Bonus',
    expertLabel: 'Berufs­einsteiger-Bonus',
    shortHelp:
      'Einmalig 200 EUR zusätzliche Zulage für Sparer unter 25 Jahren bei Vertrags­abschluss. Bekommst du nur einmal im Leben.',
    legalReference: '§84 EStG (a.F.)',
    category: 'foerderung',
  },
  {
    id: 'standarddepot',
    plainLabel: 'Standard­depot',
    expertLabel: 'Standard­depot (Altersvorsorge­reformgesetz 2027)',
    shortHelp:
      'Zertifizierte AVD-Variante mit auto­matischem Gleitpfad (höherer Aktien­anteil in jungen Jahren, sicherer in der Nähe des Renten­beginns) und Effektiv­kosten-Cap von 1,0 % p.a.',
    category: 'foerderung',
  },

  // ─── Auszahlung ──────────────────────────────────────────────────────────
  {
    id: 'leibrente',
    plainLabel: 'Lebens­lange Rente (Leibrente)',
    expertLabel: 'Leibrente',
    shortHelp:
      'Lebens­lange Auszahlung nach Renten­beginn — endet erst beim Tod (oder nach Garantie­zeit für Hinterbliebene). Höhe = Vertrags-Renten­faktor × Kapital.',
    category: 'auszahlung',
  },
  {
    id: 'zeitrente',
    plainLabel: 'Zeitrente',
    expertLabel: 'Zeitrente',
    shortHelp:
      'Befristete Auszahlung über eine fest gewählte Anzahl Jahre (z. B. 20). Nach Ablauf endet die Rente — auch wenn du noch lebst.',
    category: 'auszahlung',
  },
  {
    id: 'kapitalverzehr',
    plainLabel: 'Selbst­gesteuerte Entnahme',
    expertLabel: 'Kapital­verzehr',
    shortHelp:
      'Du erhältst das Kapital aus­bezahlt und entnimmst selbst. Im Modell: gleich­mäßige Entnahme bis zum globalen Endalter. Risiko: Lange-Lebens-Risiko liegt bei dir.',
    category: 'auszahlung',
  },
  {
    id: 'rentenfaktor',
    plainLabel: 'Renten­faktor',
    expertLabel: 'Renten­faktor (EUR/10.000 EUR Kapital)',
    shortHelp:
      'Vertrag­licher Umrechnungs­faktor: pro 10.000 EUR Kapital bei Renten­beginn zahlt der Versicherer monatlich z. B. 28 EUR. Steht in deinem Versicherungs­schein.',
    category: 'auszahlung',
  },

  // ─── Kosten ──────────────────────────────────────────────────────────────
  {
    id: 'effektivkosten',
    plainLabel: 'Effektiv­kosten (RIY)',
    expertLabel: 'Effektiv­kosten / Reduction-In-Yield',
    shortHelp:
      'Gesamt­kosten­quote eines Versicherungs­vertrags: um wie viel pp die Brutto­rendite jährlich durch alle Kosten gemindert wird. Nettotarife liegen bei 0,6–1,0 %, klassische Tarife bei 1,5–2,5 %.',
    category: 'kosten',
  },
  {
    id: 'wrapper-fee',
    plainLabel: 'Mantel­gebühr',
    expertLabel: 'Versicherungs­mantel-Gebühr',
    shortHelp:
      'Verwaltungs­gebühr des Versicherers oben drauf auf die Fonds­kosten. Fließt jährlich auf das Kapital ab. Typisch 0,3–1,2 % p.a.',
    category: 'kosten',
  },
  {
    id: 'ter',
    plainLabel: 'Fonds­kosten (TER)',
    expertLabel: 'Total Expense Ratio',
    shortHelp:
      'Laufende Kosten des Investmentfonds / ETFs. ETFs liegen typisch bei 0,1–0,3 % p.a., aktive Fonds bei 1–2 %.',
    category: 'kosten',
  },
  {
    id: 'abschlusskosten',
    plainLabel: 'Vertriebs­kosten / Abschluss­kosten',
    expertLabel: 'Abschluss- und Vertriebs­kosten',
    shortHelp:
      'Provision für Vermittler / Versicherer beim Vertrags­abschluss. Wird oft auf die ersten 5 Jahre verteilt — drückt die Kapital­bildung in der Anfangs­phase stark.',
    category: 'kosten',
  },

  // ─── Steuern & SV ────────────────────────────────────────────────────────
  {
    id: 'vorsorgepauschale',
    plainLabel: 'Vorsorge­pauschale',
    expertLabel: 'Vorsorge­pauschale §39b EStG',
    shortHelp:
      'Pauschaler Abzug bei der Lohnsteuer­berechnung für Renten-, Kranken- und Pflege­versicherungs­beiträge. Senkt die monatliche Lohnsteuer.',
    legalReference: '§39b Abs. 2 EStG',
    category: 'steuer-sv',
  },
  {
    id: 'versorgungsfreibetrag',
    plainLabel: 'Versorgungs­freibetrag',
    expertLabel: 'Versorgungs­freibetrag §19 EStG',
    shortHelp:
      'Steuer­freier Anteil von Versorgungs­bezügen (bAV-Renten, Beamten­pensionen) — kohorten­abhängig. Sinkt jährlich; ab 2058 = 0.',
    legalReference: '§19 Abs. 2 EStG',
    category: 'steuer-sv',
  },
  {
    id: 'bbg',
    plainLabel: 'Beitrags­bemessungs­grenze (BBG)',
    expertLabel: 'Beitrags­bemessungs­grenze',
    shortHelp:
      'Gehalts­obergrenze für Sozial­versicherungs­beiträge. 2026 RV-West 96.600 EUR/Jahr, KV/PV 69.750 EUR/Jahr. Verdienst darüber ist beitragsfrei.',
    category: 'steuer-sv',
  },
  {
    id: 'fuenftelregelung',
    plainLabel: 'Fünftel­regelung',
    expertLabel: 'Fünftel­regelung §34 EStG',
    shortHelp:
      'Steuer­ermäßigung für einmalige Kapital­aus­zahlungen (z. B. Direkt­zusage-Kapital): die Steuer­last wird so berechnet, als verteile sich die Aus­zahlung auf 5 Jahre. Gilt nicht für §3 Nr. 63-bAV.',
    legalReference: '§34 Abs. 2 Nr. 4 EStG',
    category: 'steuer-sv',
  },
]

export const TERMS_BY_ID: Record<string, Term> = Object.fromEntries(
  TERMS_LIST.map((t) => [t.id, t]),
)

export function getTerm(id: string): Term | undefined {
  return TERMS_BY_ID[id]
}
