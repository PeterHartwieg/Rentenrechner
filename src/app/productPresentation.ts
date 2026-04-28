import type { FeeModel } from '../domain'
export { getProductMeta, PRODUCT_MANIFEST } from '../engine/productManifest'

/** GRV has no product module — keep its colour here as a standalone constant. */
export const GRV_COLOR = '#16a34a'

export type WarningStatus = 'implementiert' | 'vereinfacht' | 'nicht-modelliert'

const BASE_FEE: Pick<FeeModel, 'acquisitionCostSpreadYears'> = { acquisitionCostSpreadYears: 5 }

// #55 / #58: Fee presets for bAV and pAV (all-in configurations for one-click loading).
// Sources: BAV_RESEARCH.md — Allianz/AXA examples, typical ETF-Nettotarif benchmarks.
export const BAV_FEE_PRESETS: { label: string; fees: FeeModel }[] = [
  {
    label: 'Nettotarif',
    fees: { wrapperAssetFee: 0.003, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
  {
    label: 'Standard',
    fees: { wrapperAssetFee: 0.006, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hochkosten',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.0975, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hoher AG-Match',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
]

export const PAV_FEE_PRESETS: { label: string; fees: FeeModel }[] = [
  {
    label: 'Nettotarif',
    fees: { wrapperAssetFee: 0.004, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
  {
    label: 'Standard',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 5, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hochkosten',
    fees: { wrapperAssetFee: 0.008, fundAssetFee: 0.0025, contributionFee: 0.09, fixedMonthlyFee: 5, acquisitionCostPct: 0.04, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Altvertrag',
    fees: { wrapperAssetFee: 0.012, fundAssetFee: 0.002, contributionFee: 0.03, fixedMonthlyFee: 5, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
]

export const CALCULATION_WARNINGS: { category: string; status: WarningStatus; note: string }[] = [
  {
    category: '2026 Steuerregeln',
    status: 'implementiert',
    note: 'EStG §32a Tarif, SV-Beiträge 2026, bAV §3 Nr. 63 EStG. KV-Freibetrag §226(2) SGB V und PV-Freigrenze §57(1) SGB XI für Versorgungsbezüge. (#32)',
  },
  {
    category: 'bAV-Förderung',
    status: 'implementiert',
    note: 'Entgeltumwandlung, Steuer- und SV-Ersparnis, AG-Pflicht- und Extra-Zuschuss.',
  },
  {
    category: 'Lohnsteuer-Engine',
    status: 'implementiert',
    note: 'BMF-PAP 2026 Vorsorgepauschale (RV + GKV + PV, ohne AV) für Steuerklasse I. PKV: Prämien als KV/PV-Teilbetrag der Vorsorgepauschale (§39b EStG), AG-Zuschuss §257 SGB V steuerfrei (§3 Nr. 62 EStG). Kirchensteuer nicht berechnet (immer 0 %).',
  },
  {
    category: 'ETF-Vorabpauschale',
    status: 'implementiert',
    note: 'Jährliche Vorabpauschale nach InvStG §18; Jahresanfangswert (Vollperiode) + Monatsbeiträge × (verbleibende Monate / 12) als Basisertrag-Bemessungsgrundlage; begrenzt auf tatsächliches Jahreswachstum; Sparerpauschbetrag 1.000 EUR p.a. angesetzt; vorausgezahlte VP mindert den Veräußerungsgewinn bei Entnahme (§19 InvStG). Basiszins 2026: 3,20 % (BMF-Schreiben 2026-01-13), für alle Projektionsjahre konstant angesetzt. (#7, #31, #36)',
  },
  {
    category: 'ETF-Sparerpauschbetrag',
    status: 'implementiert',
    note: '1.000 EUR/Jahr in der Ansparphase auf Vorabpauschale; 1.000 EUR/Jahr in der Entnahmephase auf laufende Gewinne. Teilfreistellung (InvStG §20) konfigurierbar. Kein Pauschbetrag auf das Einmalkapital. (#7, #20)',
  },
  {
    category: 'Versicherungssteuer',
    status: 'implementiert',
    note: 'Steuerbehandlung automatisch aus Vertragsjahr abgeleitet: vor 2005 steuerfrei (§52 Abs. 28 EStG a.F.), ab 2005 mit ≥12 Jahren Laufzeit und Auszahlung ab 62 Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG – halber Ertrag mit persönlichem Steuersatz), sonst Abgeltungsteuer 25 % + Soli (§20 Abs. 2 EStG). (#38)',
  },
  {
    category: 'bAV Rentenphase',
    status: 'implementiert',
    note: 'Grenzsteuer konfigurierbar; KVdR-/freiwillig-GKV-Toggle: KVdR mit Freibetrag §226(2) SGB V, freiwillig ohne. KV/PV-Aufschlüsselung sichtbar. (#6)',
  },
  {
    category: 'bAV Kapitalabfindung',
    status: 'implementiert',
    note: 'KV/PV nach §229 SGB V 1/120-Verteilung (120 Monate); Auszahlungsbesteuerung wird aus dem Durchführungsweg abgeleitet: §3 Nr. 63 EStG (Direktversicherung, Pensionskasse, Pensionsfonds) → voller Steuersatz §22 Nr. 5 EStG ohne Fünftelregelung; §40b EStG a.F. + Voraussetzungen erfüllt → steuerfrei §52 Abs. 28 EStG a.F.; Direktzusage/U-Kasse → Fünftelregelung §34 Abs. 2 Nr. 4 EStG. PKV-Mitglieder ohne KV/PV-Abzug. (#6/#19/#48)',
  },
  {
    category: 'Gesetzliche Rente',
    status: 'vereinfacht',
    note: 'GRV-Schätzung: Entgeltpunkte × Rentenwert oder manueller Renteninformation-Wert; optionales Gehaltswachstum und Rentenwert-Indexierung konfigurierbar. Steuerpipeline (§22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil) und KV/PV (§249a SGB V KVdR-Halbierung) vollständig modelliert. Vereinfachung: nur KVdR-Modus; BBG/Durchschnittsentgelt zum aktuellen Jahr fixiert. (#72, Group E)',
  },
  {
    category: 'Basisrente (Rürup)',
    status: 'vereinfacht',
    note: 'Schicht-1 Deductibility: §10 Abs. 3 EStG Höchstbetrag 30.826 EUR; GRV-Beiträge (AN+AG) reduzieren den Restbetrag; 100% Abzugsfähigkeit (§10 Abs. 3 Satz 1 EStG 2026). Steuerpipeline: §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil (identisch GRV). KV/PV: §240 SGB V (voller GKV-Beitragssatz ohne §226(2)-Freibetrag). Vereinfachungen: freiwillig-Pfad für KV unabhängig vom tatsächlichen GKV-Status im Rentenalter; kein Kapitalwahlrecht modelliert. (#61)',
  },
  {
    category: 'Altersvorsorgedepot (Schicht 2)',
    status: 'vereinfacht',
    note: 'Altersvorsorgereformgesetz (Bundestag 2026-03-27; Bundesrat-Zustimmung erwartet 2026-05-08). Modelliert: Grundzulage (Zweistufenformel, max. 540 EUR), Kinderzulage (100 %, max. 300 EUR/Kind), Berufseinsteiger-Bonus (200 EUR einmalig), indirekter Ehegatte (max. 175 EUR), §10a Günstigerprüfung. Standarddepot-Gleitpfad: 5 Jahre vor Rentenbeginn max. 50 % Risikoanlage, 2 Jahre vor Rentenbeginn max. 30 %. Effektivkosten-Warnung bei > 1,0 pp. Auszahlung: §22 Nr. 5 EStG (volle Progression, kein Besteuerungsanteil), KV/PV freiwillig-Pfad §240 SGB V. Nicht modelliert: Altvertrag-Riester-Fortführung (#62); Wohn-Riester; Kleinbetragsrenten-Kommutierung. Konstanten aus Bundesrat-Drucksache 206/26 — prüfen nach BGBl.-Veröffentlichung. (#66–#71)',
  },
  {
    category: 'Rendite-Szenarien',
    status: 'vereinfacht',
    note: 'Feste Rendite, keine stochastische Simulation. Planrechnungen, keine Prognosen.',
  },
]

export const BADGE_LABEL: Record<WarningStatus, string> = {
  implementiert: '✓ implementiert',
  vereinfacht: '⚠ vereinfacht',
  'nicht-modelliert': '✗ nicht modelliert',
}

