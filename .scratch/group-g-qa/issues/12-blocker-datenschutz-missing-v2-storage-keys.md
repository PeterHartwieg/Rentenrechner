---
title: "BLOCKER: Datenschutz page does not list v2 workspace localStorage keys"
Status: done
Severity: blocker
Area: legal / Datenschutz / storage
---

## Description

Code writes the v2 workspace key ([storage.ts:18](src/storage.ts), [storage.ts:623](src/storage.ts)) and a workspace-view key exists ([useWorkspace.ts:3](src/app/useWorkspace.ts)), but the privacy page ([DatenschutzPage.tsx:87](src/features/legal/DatenschutzPage.tsx)) only lists v1 / library / guided / disclaimer localStorage keys.

This is a **legal-content gap** that must be closed before public launch. The GDPR-style transparency requirement (Art. 13/14 DSGVO) obligates the privacy page to accurately enumerate all local storage used.

## Fix

Update [`DatenschutzPage.tsx`](src/features/legal/DatenschutzPage.tsx) to add:
- The v2 workspace key (derive the constant from `storage.ts` rather than hardcoding the string).
- The workspace-view key from `useWorkspace.ts`.
- Any other keys introduced since the last Datenschutz update.

## Notes

Whenever a new localStorage key is added to the codebase, a corresponding entry in `DatenschutzPage` is mandatory. Consider co-locating a constants file that both `storage.ts` and `DatenschutzPage` import, to make it impossible to add a key without updating the privacy page.
