export const PRODUKT_ROW_ASIDE_DEFAULT = 'Diese Werte fließen direkt in dein Mein-Plan-Ergebnis ein.'

/** Sidebar caption by instance status, so an unsigned offer never claims to count. */
export function produktRowAsideCopy(status: 'active' | 'paid_up' | 'surrendered' | 'offered'): string {
  switch (status) {
    case 'offered':
      return 'Angebot, noch nicht abgeschlossen: zählt nicht zu deiner Rente in Mein Plan. Prüfen kannst du es über „Angebote“ auf der Planseite.'
    case 'surrendered':
      return 'Gekündigt: dieser Vertrag zahlt keine Rente mehr in dein Mein-Plan-Ergebnis.'
    default:
      return PRODUKT_ROW_ASIDE_DEFAULT
  }
}
