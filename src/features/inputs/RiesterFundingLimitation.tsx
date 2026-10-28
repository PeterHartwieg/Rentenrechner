/** Interim disclosure for #420; remove once all spouse funding paths are supported. */
export function RiesterFundingLimitation() {
  return (
    <p className="hint" role="note">
      <strong>Riester bei Paaren: Berechnung noch eingeschränkt.</strong>{' '}
      Zulagen und Steuervorteile werden derzeit vereinfacht berechnet. Eigene
      Förderberechtigungen und Beiträge beider Personen sowie Verträge mit und
      ohne Förderung werden noch nicht vollständig getrennt berücksichtigt.
      Dadurch können Förderung, Netto-Aufwand und spätere Rente zu hoch oder zu
      niedrig ausfallen. Nutze diese Ergebnisse vorerst nur als grobe Orientierung.
      Dieser Hinweis betrifft Riester-Altverträge, nicht das Altersvorsorgedepot.
    </p>
  )
}
