/** Interim disclosure for #420; remove once all spouse funding paths are supported. */
export function RiesterFundingLimitation() {
  return (
    <p className="hint" role="note">
      <strong>Riester bei Paaren: Angaben beider Personen nötig.</strong>{' '}
      Zulagen und Steuervorteile berücksichtigen die zugeordneten Personen und
      förderfähigen Verträge. Ohne vollständige Partnerangaben bleibt die
      Förderung eine Schätzung. Ohne Vorjahreseinkommen verwenden wir das aktuelle
      Einkommen als Näherung. Die Rentenphase bleibt vereinfacht: Nicht geförderte
      Beitragsanteile werden steuerlich noch nicht getrennt behandelt. Dadurch
      können Netto-Aufwand und spätere Rente abweichen.
      Dieser Hinweis betrifft Riester-Altverträge, nicht das Altersvorsorgedepot.
    </p>
  )
}
