/**
 * Vintage auto-detection helpers (Group G issue 06).
 *
 * Produces read-only chip descriptors for per-instance contract cards.
 * These are purely informational — the engine already applies the correct
 * vintage-aware tax routes (pre-2005 pAV, §40b a.F. bAV) based on
 * `contractStartYear` + `durchfuehrungsweg`. The chips surface the
 * engine's routing decision to the user.
 *
 * Exported as a pure function so it can be tested without React.
 */

export type VintageChipId = 'halbeinkuenfte_pre2005' | 'par40b_aF'

export interface VintageChip {
  id: VintageChipId
  label: string
  /** Short explanation for the InfoTip tooltip. */
  tooltip: string
}

/**
 * Shape matching the minimum fields we need from InstanceCommon to detect
 * vintage. The caller passes the full instance; we only read these fields.
 */
interface VintageDetectionInput {
  contractStartYear: number
  /**
   * Present on bAV instances only. We use the BavDurchfuehrungsweg string
   * literals directly so this module does not depend on domain/products/bav.
   */
  durchfuehrungsweg?: string
}

/**
 * Return read-only chip descriptors for the given instance.
 *
 * - pAV / bAV / any product with `contractStartYear ≤ 2004`:
 *   'halbeinkuenfte_pre2005' chip (§52 Abs. 28 EStG a.F. / Halbeinkünfteverfahren).
 * - bAV `durchfuehrungsweg === 'direktversicherung_40b_alt'` AND
 *   `contractStartYear ≤ 2004`:
 *   'par40b_aF' chip (§40b EStG a.F., Direktversicherung Altvertrag).
 *
 * Note: both chips can appear simultaneously on a §40b a.F. bAV Altvertrag
 * that qualifies for both privileges (the §40b chip is the specific one; the
 * Halbeinkünfte chip is the general pre-2005 privilege).
 */
export function detectVintageChips(instance: VintageDetectionInput): VintageChip[] {
  const chips: VintageChip[] = []

  if (instance.contractStartYear <= 2004) {
    chips.push({
      id: 'halbeinkuenfte_pre2005',
      label: 'Altvertrag vor 2005',
      tooltip:
        'Vertrag vor 2005: Gewinne werden nach dem Halbeinkünfteverfahren nur zur Hälfte ' +
        'versteuert (§52 Abs. 28 EStG a.F.). Der Rechner berücksichtigt dies automatisch.',
    })
  }

  if (
    instance.durchfuehrungsweg === 'direktversicherung_40b_alt' &&
    instance.contractStartYear <= 2004
  ) {
    chips.push({
      id: 'par40b_aF',
      label: '§40b a.F. (Altvertrag)',
      tooltip:
        '§40b EStG a.F.: Direktversicherung Altvertrag (vor 2005). Pauschalversteuerung 20 % ' +
        'durch den Arbeitgeber; Auszahlung steuerfrei beim Arbeitnehmer. ' +
        'Kein KVdR-Versorgungsbezug — günstige Auszahlungsbehandlung bleibt erhalten.',
    })
  }

  return chips
}
