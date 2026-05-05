---
title: "BLOCKER: Working name 'Rentenrechner' still present in all public-facing surfaces"
Status: ready-for-human
Severity: blocker
Area: branding / rebrand
---

## Description

The working name "Rentenrechner" is baked into every public-facing surface. This must be replaced before launch (per CLAUDE.md: "working name only"). Affected locations:

| Surface | File | Line |
|---------|------|------|
| `<title>` tag | `index.html` | 7 |
| App header | `src/App.tsx` | 487 |
| Print report header | `src/features/results/PrintReport.tsx` | 70 |
| Print report footer | `src/features/results/PrintReport.tsx` | 255 |
| Legal layout footer | `src/features/legal/LegalLayout.tsx` | 32 |
| CSV export filename | `src/app/useDerivedViews.ts` | 130 |

## Fix

Once the public name/domain is decided, do a single coordinated rename pass across all six locations above. Until then, this issue tracks the open rebrand debt.

## Notes

Internal identifiers (npm package name, code symbols) can stay as-is per CLAUDE.md. Only user-visible strings need the rename.
