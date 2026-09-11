/**
 * User-facing "Berechnungshinweise" copy rendered by
 * `src/features/results/CalculationWarnings.tsx` inside "Annahmen & Risiko".
 *
 * Content only, no React. Each note describes what the calculator does for a
 * consumer reading the plan surface, so it must not carry issue numbers,
 * work-group names, or implementation status language. Statutory values
 * quoted here are descriptive; the engine reads them from `src/rules/`.
 */

export type WarningStatus = 'implementiert' | 'vereinfacht' | 'nicht-modelliert'

export interface CalculationNote {
  category: string
  status: WarningStatus
  note: string
}

export const CALCULATION_NOTES: readonly CalculationNote[] = [
  {
    category: '2026 Steuerregeln',
    status: 'implementiert',
    note: 'EStG §32a Tarif, SV-Beiträge 2026, bAV §3 Nr. 63 EStG. KV-Freibetrag §226(2) SGB V und PV-Freigrenze §57(1) SGB XI für Versorgungsbezüge.',
  },
  {
    category: 'bAV-Förderung',
    status: 'implementiert',
    note: 'Entgeltumwandlung, Steuer- und SV-Ersparnis, AG-Pflicht- und Extra-Zuschuss.',
  },
  {
    category: 'Lohnsteuer',
    status: 'implementiert',
    note: 'BMF-PAP 2026 Vorsorgepauschale (RV + GKV + PV, ohne AV) für Steuerklasse I. PKV: Prämien als KV/PV-Teilbetrag der Vorsorgepauschale (§39b EStG), AG-Zuschuss §257 SGB V steuerfrei (§3 Nr. 62 EStG). Kirchensteuer wird nicht berechnet: die Angabe im Profil wird gespeichert, alle Ergebnisse gelten aber ohne Kirchensteuer.',
  },
  {
    category: 'ETF-Vorabpauschale',
    status: 'implementiert',
    note: 'Jährliche Vorabpauschale nach InvStG §18; Jahresanfangswert (Vollperiode) + Monatsbeiträge × (verbleibende Monate / 12) als Basisertrag-Bemessungsgrundlage; begrenzt auf tatsächliches Jahreswachstum; Sparerpauschbetrag 1.000 EUR p.a. angesetzt; vorausgezahlte VP mindert den Veräußerungsgewinn bei Entnahme (§19 InvStG). Basiszins 2026: 3,20 % (BMF-Schreiben 2026-01-13), für alle Projektionsjahre konstant angesetzt.',
  },
  {
    category: 'ETF-Sparerpauschbetrag',
    status: 'implementiert',
    note: '1.000 EUR/Jahr in der Ansparphase auf die Vorabpauschale; 1.000 EUR im Liquidationsjahr auf das Einmalkapital; 1.000 EUR/Jahr in der Entnahmephase auf laufende Gewinne. Teilfreistellung (InvStG §20) konfigurierbar. Verheiratete Mitveranlagte: 2.000 EUR-Doppel-Pauschbetrag (§20 Abs. 9 EStG) noch nicht modelliert.',
  },
  {
    category: 'ETF-Vereinfachungen',
    status: 'vereinfacht',
    note: 'Nur thesaurierende Fonds modelliert (keine Ausschüttungs-ETF; Ausschüttungen würden die Vorabpauschale mindern und im Ausschüttungsjahr besteuert). Veräußerungsgewinn-Besteuerung bei Entnahmen: proportionale Gain-Ratio statt FIFO-Losprinzip (§20 Abs. 4 EStG; FIFO kann in steigenden Märkten Steuern in frühe Rentenjahre vorziehen). Kirchensteuer auf Kapitalertragsteuer nicht berechnet (Tarif gilt als ohne KiSt). Vorabpauschale-Steuerzahlung wird aus dem Portfoliokapital abgezogen; in der Praxis wird häufig das Verrechnungskonto belastet.',
  },
  {
    category: 'Versicherungssteuer',
    status: 'implementiert',
    note: 'Steuerbehandlung automatisch aus Vertragsjahr abgeleitet: vor 2005 steuerfrei (§52 Abs. 28 EStG a.F.), ab 2005 mit ≥12 Jahren Laufzeit und Auszahlung ab 60 (Verträge bis 2011) bzw. 62 (ab 2012) Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG – halber Ertrag mit persönlichem Steuersatz), sonst Abgeltungsteuer 25 % + Soli (§20 Abs. 2 EStG).',
  },
  {
    category: 'bAV Rentenphase',
    status: 'implementiert',
    note: 'Grenzsteuer konfigurierbar; KVdR-/freiwillig-GKV-Toggle: KVdR mit Freibetrag §226(2) SGB V, freiwillig ohne. KV/PV-Aufschlüsselung sichtbar.',
  },
  {
    category: 'bAV Kapitalabfindung',
    status: 'implementiert',
    note: 'KV/PV nach §229 SGB V 1/120-Verteilung (120 Monate); Auszahlungsbesteuerung wird aus dem Durchführungsweg abgeleitet: §3 Nr. 63 EStG (Direktversicherung, Pensionskasse, Pensionsfonds) → voller Steuersatz §22 Nr. 5 EStG ohne Fünftelregelung; §40b EStG a.F. + Voraussetzungen erfüllt → steuerfrei §52 Abs. 28 EStG a.F.; Direktzusage/U-Kasse → Fünftelregelung §34 Abs. 2 Nr. 4 EStG. PKV-Mitglieder ohne KV/PV-Abzug.',
  },
  {
    category: 'Gesetzliche Rente',
    status: 'vereinfacht',
    note: 'GRV-Schätzung: Entgeltpunkte × Rentenwert oder manueller Renteninformation-Wert; optionales Gehaltswachstum und Rentenwert-Indexierung konfigurierbar. Steuerpipeline (§22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil) und KV/PV (§249a SGB V KVdR-Halbierung) vollständig modelliert. Vereinfachung: nur KVdR-Modus; BBG/Durchschnittsentgelt zum aktuellen Jahr fixiert.',
  },
  {
    category: 'Basisrente (Rürup)',
    status: 'vereinfacht',
    note: 'Schicht-1-Abzug: §10 Abs. 3 EStG Höchstbetrag 30.826 EUR; GRV-Beiträge (AN+AG) reduzieren den Restbetrag; 100% Abzugsfähigkeit (§10 Abs. 3 Satz 1 EStG 2026). Steuerpipeline: §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil (identisch GRV). KV/PV: §240 SGB V (voller GKV-Beitragssatz ohne §226(2)-Freibetrag). Vereinfachungen: freiwillig-Pfad für KV unabhängig vom tatsächlichen GKV-Status im Rentenalter; kein Kapitalwahlrecht modelliert.',
  },
  {
    category: 'Altersvorsorgedepot (Schicht 2)',
    status: 'vereinfacht',
    note: 'Altersvorsorgereformgesetz (Bundestag-Beschluss 2026-03-27; Bundesrat-Zustimmung 2026-05-08; Produktstart ab 2027). Modelliert: Grundzulage (Zweistufenformel, max. 540 EUR), Kinderzulage (100 %, max. 300 EUR/Kind), Berufseinsteiger-Bonus (200 EUR einmalig), indirekter Ehegatte (max. 175 EUR), §10a Günstigerprüfung. Standarddepot-Gleitpfad: 5 Jahre vor Rentenbeginn max. 50 % Risikoanlage, 2 Jahre vor Rentenbeginn max. 30 %. Effektivkosten-Warnung bei > 1,0 pp. Auszahlung: §22 Nr. 5 EStG (volle Progression, kein Besteuerungsanteil), KV/PV freiwillig-Pfad §240 SGB V. Nicht modelliert: Altvertrag-Riester-Fortführung; Wohn-Riester; Kleinbetragsrenten-Kommutierung. Werte nach Bundesrat-Drucksache 206/26; der Abgleich mit der Fassung im Bundesgesetzblatt steht noch aus.',
  },
  {
    category: 'Rendite-Szenarien',
    status: 'vereinfacht',
    note: 'Die Hauptergebnisse (Mein Plan, Vergleich, Kapital, Alternativen) rechnen mit einer festen jährlichen Rendite je Szenario (konservativ / Basis / optimistisch). Die Monte-Carlo-Simulation ist optional: sie zeigt unter „Methode" und im Risikowert der Empfehlung, wie stark das Ergebnis bei schwankenden Märkten streuen kann, ersetzt oder verändert die feste Basisrechnung aber nicht. Alles sind Planrechnungen, keine Prognosen.',
  },
]

export const BADGE_LABEL: Record<WarningStatus, string> = {
  implementiert: '✓ implementiert',
  vereinfacht: '⚠ vereinfacht',
  'nicht-modelliert': '✗ nicht modelliert',
}
