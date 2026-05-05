# QA feedback mode — Phase 0 decision note

Status: locked
Created: 2026-05-05
Resolves: `.scratch/qa-feedback-mode/issues/01-lock-qa-mode-policy-and-target-id-convention.md`

These are the human policy decisions that all subsequent QA-feedback-mode issues
(02–10) consume. They are deliberately conservative: ship the smallest local-only
slice, preserve the no-backend / no-telemetry posture, and leave room for richer
behaviour in later phases.

## 1. QA mode availability

**Decision:** Available everywhere the app is hosted, gated only by an explicit
opt-in flag. No build-time staging/production split in the first wave.

- The flag is **off by default** for ordinary users.
- Activation is **explicit** (see §2). Normal users will not see feedback
  controls without taking a deliberate action.
- We do not ship a separate staging build; staging and production share the
  same artifact, so a build-time gate would be dead code. Re-evaluate if a
  staging deploy lands later.

**Why:** The current product posture is frontend-only, no telemetry, no
accounts. There is nothing for a malicious flag-flipper to exfiltrate — QA
mode produces local artifacts only. Restricting access by environment would
add complexity without protecting any asset that is not already public.

## 2. Activation behaviour

**Decision:** The flag is set when `?qa=1` is present in the URL on first
load. The flag is **session-scoped** (`sessionStorage`) so it survives
in-session navigation but does not leak into the next browser session.

- `?qa=1` flips the session flag on. `?qa=0` flips it off.
- A small persistent indicator chip (e.g. "QA-Modus aktiv") sits in a
  non-intrusive corner whenever the flag is on, so testers cannot mistake QA
  mode for the normal calculator (PRD US-3).
- A keyboard shortcut is **not required** in the first wave; the URL
  parameter is the canonical entry point so maintainers can share a link.
- The flag must not be backed by `localStorage` — that would create a
  permanently-feedback-y browser, which is a footgun and would interact with
  the disclaimer's session-only dismissal contract.

**Rationale for sessionStorage over localStorage:** mirrors the
`DisclaimerBanner` pattern (CLAUDE.md "Disclaimer infrastructure"). Regressing
this would couple QA mode to the same compliance surface, which is not what
we want.

## 3. Feedback target id convention

**Decision:** Stable, **semantic, dot-separated** ids in English. The id
encodes location (top-down), not visible copy.

```
<surface>.<region>.<element>[.<part>]
```

- `surface` — top-level area: `inputs`, `results`, `cashflows`, `assumptions`,
  `workspace`, `legal`, `landing`, `inventory`, `dashboard`.
- `region` — sub-area within the surface: a product id, a feature, a section
  name. Examples: `bav`, `etf`, `comparisonPicker`, `disclaimer`, `footer`.
- `element` — concrete UI element: `employerSubsidy`, `monthlyContribution`,
  `payoutMode`, `breakEvenChart`, `legalLink`.
- `part` — optional sub-part when one element has multiple labellable surfaces:
  `.label`, `.input`, `.help`, `.error`, `.tooltip`, `.legend`.

**Examples (one per category required by issue 01):**

| Category | Example id |
|---|---|
| Input field | `inputs.bav.employerSubsidy.input` |
| Input label | `inputs.bav.employerSubsidy.label` |
| Input help/tooltip | `inputs.bav.employerSubsidy.tooltip` |
| Product input section | `inputs.bav.section` |
| Workspace tab | `workspace.tabs.vergleich` |
| Workspace section fallback | `workspace.angebot.section` |
| Chart container | `results.breakEvenChart.container` |
| Chart legend item | `results.breakEvenChart.legend.bav` |
| Table column header | `results.detailComparisonTable.header.netCapitalAt67` |
| Table cell | `results.detailComparisonTable.cell.bav.netCapitalAt67` |
| Legal page text | `legal.impressum.body` |
| Disclaimer banner | `workspace.disclaimer.body` |
| Guided setup step | `landing.guidedSetup.step.bav` |
| Modal field | `dashboard.lueckeSchliessen.suggestionAccept` |

**Conventions:**

- All ids are **lowercase camelCase tokens separated by dots**. No spaces, no
  underscores, no German characters.
- Ids are **English** even though the user-facing copy is German. They are
  compile-time identifiers shared between code and tickets, not strings users
  read.
- Do **not** derive ids from the visible label (e.g. `inputs.bav.arbeitgeberZuschuss`).
  Copy changes; ids must not. `employerSubsidy` is stable across rebrand,
  translation, and rewording.
- Ids should be **unique across the app**. Two components may use the same
  reusable section (e.g. `PayoutModeSection`), but they must be invoked with
  distinct ids supplied by the parent: `inputs.bav.payoutMode` vs
  `inputs.privateInsurance.payoutMode`.
- A nearby section-level id is always available so a tester clicking a
  non-instrumented child can still produce a usable report. Mark the
  resolution precision (`exact` | `nested` | `section` | `unknown`) on the
  generated payload.

## 4. First-wave local export destination

**Decision:** **Both** clipboard Markdown **and** local file download in
the tracer bullet.

- **Clipboard Markdown** is the primary path: one click copies the reviewed
  ticket to the OS clipboard.
- **Local file download** is the fallback: tester downloads a small bundle
  (Markdown ticket + screenshot artifact + JSON payload). This is the path
  for environments where clipboard access is blocked or where the screenshot
  needs to travel with the ticket.
- A `mailto:` / prefilled-issue-URL helper is **deferred to issue 08** —
  not part of the tracer bullet.

**Rationale:** Clipboard alone loses the screenshot. Download alone is
heavier-weight than the common case (paste into Slack / GitHub) needs. Both
together give testers the right tool for each context, with no backend.

## 5. Screenshot behaviour (first wave)

**Decision:** Capture the **current viewport** as a single client-side
screenshot. Do not attempt full-page capture in the first wave.

- Capture happens after target selection so the pinned target is visible in
  the frame.
- Implementation uses `html2canvas` or a similar pure-DOM rasteriser so no
  browser permissions are needed. We will pick the concrete library when
  issue 02 lands; the contract is "produces a `Blob`/`dataURL` synchronously
  enough to embed in the preview".
- The screenshot is **always reviewed before export** — the preview shows
  it inline and the tester can drop it before exporting.

**Minimum redaction rule (first wave):**

- Inputs marked with a `data-qa-sensitive="true"` attribute (or equivalent
  prop on reusable primitives) are visually masked in the screenshot — the
  pixels covering those elements are blurred or blacked-out before the
  rasteriser runs.
- Fields covered: `NumberField` instances bound to salary, contributions,
  retirement assumptions, and any user-entered profile/scenario data. The
  concrete sensitive-field list is decided in issue 03; the **mechanism**
  (a sensitivity flag on inputs + a redaction pass on the screenshot) is
  locked here.
- Issue 03 will extend this with manual masking ("brush over this region")
  and richer per-field controls. The tracer bullet only needs the
  default-on automatic redaction.

## 6. Production access

**Decision:** `?qa=1` works on **all deployments** including production,
because there is nothing to protect (see §1). The visible "QA-Modus aktiv"
chip ensures end users notice if they accidentally land in a QA link.

- We accept that a curious end user could enable QA mode. The artefacts
  they could produce contain only their own state, exported locally, with
  no upload path. This is functionally equivalent to viewing
  `localStorage` in DevTools.
- Re-evaluate this decision if a future backend submission path is added
  (issue 10 explicitly forbids one in the first wave).

## 7. Drafts and persistence

**Decision:** Drafts live **in memory only** during the tester's session.
No `localStorage`, no `sessionStorage` for draft content. A page reload
discards any in-progress draft.

**Why:** persistent drafts would create a "ghost data" surface that
interacts awkwardly with the no-PII guardrail. Not in scope for the first
wave.

## 8. Naming for the feature module

**Decision:** New module lives at `src/features/qa-feedback/` with the
public entry point exported as `QaFeedbackProvider` / `useQaFeedback`. The
ticket-payload builder lives at `src/features/qa-feedback/report/` and is
React-free (testable with Vitest only).

This keeps the QA feedback surface co-located with other features (mirrors
`src/features/legal/`, `src/features/workspace/`) and keeps the deep
ticket-builder module independent of UI.

## Open questions (deferred, not blocking)

- Concrete html2canvas-vs-other choice (issue 02).
- Manual masking UX (issue 03).
- Final list of `data-qa-sensitive` fields (issue 03).
- mailto vs GitHub prefill destination (issue 08; recommend `mailto:` first
  because it requires nothing about repo URL or labels).

## Cross-references

- PRD: `.scratch/qa-feedback-mode/PRD.md`
- Phase plan: `.scratch/qa-feedback-mode/PHASE-PLAN.md`
- Subsequent issues consume these decisions via this file. If a decision
  changes, update this file in the same PR that ships the change.
