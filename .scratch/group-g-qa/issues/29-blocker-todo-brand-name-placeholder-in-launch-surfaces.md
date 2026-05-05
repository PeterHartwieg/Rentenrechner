---
title: "BLOCKER: TODO_BRAND_NAME placeholder ships in HTML title, header, print, and CSV filenames"
Status: ready-for-human
Severity: blocker
Area: Group P / branding / publication
---

## Description

The `TODO_BRAND_NAME` placeholder is present in launch-facing surfaces:

- HTML document title: [index.html:7](index.html)
- App header: [App.tsx:562](src/App.tsx)
- Print reports (compare and combine): [PrintReport.tsx:100](src/features/results/PrintReport.tsx), [PrintReport.tsx:357](src/features/results/PrintReport.tsx)
- CSV filenames: [useDerivedViews.ts:141](src/app/useDerivedViews.ts), [useDerivedViews.ts:155](src/app/useDerivedViews.ts)

Public docs still use the working name in visible positions: [README.md:1](README.md), [COMMERCIAL_LICENSE.md:3](COMMERCIAL_LICENSE.md).

## Impact

The previous "hard-coded Rentenrechner" issue (#13) is improved — the TODOs are easy to grep and there is no risk of accidental rebrand of internal symbols. But this is **not launchable**: the public site would render `TODO_BRAND_NAME` in the browser tab and on every PDF/CSV the user produces.

## Fix direction

Once the public name is decided, do a single coordinated rebrand pass:
- Replace all `TODO_BRAND_NAME` placeholders.
- Update README and COMMERCIAL_LICENSE visible positions (keep working-name references in design docs / decisions where they are historical).
- Verify `npm run build` then visit dist/ to confirm no placeholder leaks (head title, OG tags, print preview, CSV download filename).

Internal identifiers (npm package, code symbols) can stay as-is per CLAUDE.md.

## Affected users

Every public visitor on launch day.

## Notes

Follow-on of #13. Branding decision is itself the unblocker; the code change is mechanical once the name lands.
