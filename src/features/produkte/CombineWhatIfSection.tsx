import { useState } from 'react'
import type { WhatIfScenario } from '../../domain/workspace'

/**
 * `CombineWhatIfSection` — what-if lifecycle controls for combine mode.
 *
 * PR 4 retired `CombineDashboardSidebar`, which hosted the what-if list, the
 * stale/frozen baseline badge (re-base / freeze), and the archive-and-restart
 * action. `useAngabenState` still exposes `rebaseWhatIf` / `freezeWhatIf` /
 * `archiveAndRestart`, and what-ifs are still created via the
 * ContractDecisionMenu ("Optimiere deine Vorsorge"), but with the sidebar gone
 * there was no UI to manage them — created plans were stranded (Codex PR #347
 * R3). Logic ported verbatim from the deleted sidebar; styling rebuilt with
 * Sober D tokens.
 */

function BaselineStaleBadge({
  whatIf,
  baselineLastEditedAt,
  onRebase,
  onFreeze,
}: {
  whatIf: WhatIfScenario
  baselineLastEditedAt: number | undefined
  onRebase: () => void
  onFreeze: () => void
}) {
  const snapshotCreatedAt = new Date(
    whatIf.derivedFromBaselineSnapshot.createdAt,
  ).getTime()
  // Only treat the baseline as "edited" when lastEditedAt is a real timestamp
  // (> 0). A zero/missing value means the baseline was never explicitly edited.
  const editedAt = (baselineLastEditedAt ?? 0) > 0 ? baselineLastEditedAt! : 0

  // Frozen badge only when the user explicitly invoked freeze (frozenAt > 0)
  // and the freeze post-dates the last baseline edit.
  if (
    whatIf.frozenAt !== undefined &&
    whatIf.frozenAt > 0 &&
    whatIf.frozenAt >= editedAt
  ) {
    const frozenDate = new Date(whatIf.frozenAt).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
    return (
      <div className="produkte-stale-badge produkte-stale-badge--frozen">
        Eingefroren am {frozenDate}
      </div>
    )
  }

  // No stale signal if the baseline was never explicitly edited, or the edit
  // did not happen after the snapshot was taken.
  if (editedAt === 0 || editedAt <= snapshotCreatedAt) return null

  return (
    <div className="produkte-stale-badge" role="alert">
      <span className="produkte-stale-badge__label">Baseline hat sich geändert</span>
      <div className="produkte-stale-badge__actions">
        <button
          type="button"
          className="produkte-stale-badge__action produkte-stale-badge__action--rebase"
          onClick={onRebase}
          title="Auf aktuellen Stand re-basen"
        >
          Auf aktuellen Stand re-basen
        </button>
        <button
          type="button"
          className="produkte-stale-badge__action"
          onClick={onFreeze}
          title="Snapshot beibehalten"
        >
          Snapshot beibehalten
        </button>
      </div>
    </div>
  )
}

export function CombineWhatIfSection({
  whatIfs,
  baselineLastEditedAt,
  hasContracts,
  onRebase,
  onFreeze,
  onArchiveAndRestart,
}: {
  whatIfs: WhatIfScenario[]
  baselineLastEditedAt: number | undefined
  hasContracts: boolean
  onRebase: (id: string) => void
  onFreeze: (id: string) => void
  onArchiveAndRestart: () => void
}) {
  const [archiving, setArchiving] = useState(false)
  const showArchiveButton = hasContracts || whatIfs.length > 0
  if (whatIfs.length === 0 && !showArchiveButton) return null

  return (
    <section className="produkte-whatifs" aria-label="Was-wäre-wenn-Pläne">
      {whatIfs.length > 0 && (
        <>
          <h2 className="produkte-whatifs__heading">Was-wäre-wenn-Pläne</h2>
          <div className="produkte-whatifs__list">
            {whatIfs.map((wi) => (
              <div className="produkte-whatif-card" key={wi.id}>
                <div className="produkte-whatif-card__header">
                  <span className="produkte-whatif-card__label">{wi.label}</span>
                  <span className="produkte-whatif-card__origin">
                    {wi.origin === 'recommender' ? 'Empfehlung' : 'Manuell'}
                  </span>
                </div>
                <BaselineStaleBadge
                  whatIf={wi}
                  baselineLastEditedAt={baselineLastEditedAt}
                  onRebase={() => onRebase(wi.id)}
                  onFreeze={() => onFreeze(wi.id)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {showArchiveButton && (
        <div className="produkte-archive">
          {/* Inline trade-off hint — visible before the click so the user
              understands the data loss before deciding. */}
          <p className="produkte-archive__hint">
            Mehrere Verträge pro Produkttyp werden im Archiv zu einem
            zusammengefasst.
          </p>
          <button
            type="button"
            className="produkte-archive__btn"
            disabled={archiving}
            onClick={() => {
              // Prevent double-clicks from writing two library entries.
              if (archiving) return
              const ok = window.confirm(
                'Aktuellen Stand als Baseline speichern und neu starten?\n\n' +
                  '• Verträge mit mehreren Instanzen werden in der Archiv-Vorschau auf je einen pro Produkttyp zusammengefasst.\n' +
                  '• Alle aktuellen Was-wäre-wenn-Szenarien werden gelöscht.\n\n' +
                  'Fortfahren?',
              )
              if (!ok) return
              setArchiving(true)
              try {
                onArchiveAndRestart()
              } finally {
                setArchiving(false)
              }
            }}
            title="Aktuellen Stand speichern und What-Ifs zurücksetzen"
          >
            Aktuellen Stand als Baseline speichern und neu starten
          </button>
        </div>
      )}
    </section>
  )
}
