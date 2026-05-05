---
title: "BLOCKER: Landing page overclaims the fair-comparison invariant"
Status: done
Severity: blocker
Area: Group G / landing page / advice surface
---

## Description

The compare-mode card on the landing page says all six products are shown "mit gleicher Einzahlung als fairer Vergleichsbasis" ([LandingPage.tsx:131](src/features/landing/LandingPage.tsx)).

The implementation and the corrected in-app tooltip say the opposite: **only ETF and private insurance** are forced to the equal amount. bAV, Basisrente, AVD, and Riester keep their own contribution / funding fields ([InputsPanel.tsx:308](src/features/inputs/InputsPanel.tsx), [equalInputComparator.ts:25](src/engine/equalInputComparator.ts), [equalInputComparator.ts:74](src/engine/equalInputComparator.ts)).

## Impact

The first public CTA teaches the wrong invariant. This is especially dangerous for broker-style comparisons because "same contribution" sounds stronger than what the engine actually does — a broker could quote the landing copy as proof the comparison is fair on a basis that, for four of six products, it isn't.

Compounds the disclaimer / "not advice" guardrail in CLAUDE.md: misstating the invariant in the headline copy undermines the legal posture even with the disclaimer present.

## Fix direction

Rewrite the landing copy to match `InputsPanel.tsx`'s tooltip exactly. Suggested phrasing direction:

> ETF und private Rentenversicherung werden mit identischer Netto-Einzahlung verglichen (gleicher Liquiditätsabfluss). bAV, Basisrente, AVD und Riester nutzen ihre tatsächlichen Beiträge inklusive staatlicher Förderung — ein "fairer Vergleich" auf Beitragshöhe ist hier nicht möglich, weil die Förderlogik produktspezifisch ist.

Final copy TBD; the requirement is that landing, tooltip, and engine all say the same thing.

## Affected users

Every first-time visitor in compare mode.

## Notes

Follow-on of #15. #15 fixed the engine + tooltip; this is the remaining surface that still misstates it.
