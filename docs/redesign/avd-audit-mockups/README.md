# Finanzfluss-AVD-Audit — Design-Referenzmockups

Standalone HTML mockups (Design Components) for the frontend changes proposed in
`docs/finanzfluss-avd-frontend-audit.md`. Open directly in a browser
(keep `support.js` next to them).

## Files

- **avd-eingabe-redesign.dc.html** — component-level design of the new
  `AvdContributionField` / `RangeNumberField`:
  - Leitfrage "Wie viel zahlst du selbst ein?" (Eigenbeitrag statt Netto-Aufwand)
  - Beitragsstufen quick-choice cards: 10 € (Mindestbeitrag, 120 €/Jahr floor),
    30 € (Ende 50 %-Zulagenstufe), 150 € (volle Grundzulage 540 €),
    dynamischer Vertragsrahmen ((6.840 € − Zulagen)/12)
  - Slider + exaktes Zahlenfeld (synced), Slider-Max = Vertragsrahmen
  - Sofort-Erklärung: Eigenbeitrag → Zulagen → Steuervorteil → Netto-Aufwand nach Steuer
  - Progressive Disclosure: Subtyp, Allokation, Sicherheitsrendite, Kosten,
    Übertragung, andere Renteneinkommen unter "Erweitert"
  - Same control shown compact for combine-mode instance editor + inventory wizard
  - Numbered annotations map each change to the audit findings

- **eingaben-produkte-full-mockup.dc.html** — full-page mockup of
  `/eingaben/produkte` (Schritt 2, compare mode) with the new AVD editor
  integrated into the Sober D shell (chrome, DStepIndicator, DProduktRow,
  Sparform grid, right rail, footer). ETF row's Sparrate is live-coupled to
  the AVD Netto-Aufwand (fair-comparison invariant).

- **support.js** — runtime for the .dc.html files. Not for production use.

## Implementation notes

- Zulage math in the mockups uses the real `de2026.ts` AVD constants
  (tier1 50 % bis 360 €, tier2 25 % bis 1.800 €, Grundzulage max 540 €,
  Kinderzulage 300 €, Vertragsdeckel 6.840 €); the Steuervorteil is a
  simplified Günstigerprüfung with a configurable Grenzsteuersatz — use the
  engine's real funding result in the implementation.
- Styling uses only existing tokens from `src/App.css` (no new tokens).
- Presets stay per contract; a second contract is a second instance.
- Sliders only for bounded values — salary etc. keep exact inputs only.
