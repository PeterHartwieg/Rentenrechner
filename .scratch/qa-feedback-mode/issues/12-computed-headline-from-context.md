# Computed headline from Schweregrad + Art + Container

Status: done
Type: enhancement
Priority: major

## Parent

.scratch/qa-feedback-mode/PRD.md

## Problem

The composer panel header currently says "Kommentar" as a field label, and the generated ticket title echoes the tester's comment text. This makes triage harder — every ticket starts with a free-text fragment instead of a structured summary.

A better UX: the composer generates a headline automatically from the structured fields (severity, feedback type, selected container/target label), and the tester's comment becomes the body. This gives scannable, consistent ticket titles in the issue list without requiring testers to write good titles manually.

## What to change

1. **`buildTitle.ts`** — Change `generateTitle` to produce a headline from severity + type + target label/id instead of echoing the comment. Format: `[Severity] qa(type): <target label or id>`. Drop the ` — <comment summary>` tail from the title. The comment belongs in the ticket body only.

2. **`QaComposer.tsx`** — The "Kommentar" field label is fine as a field label. But the panel header (`<span className="qa-panel__title">Feedback geben</span>`) should show a live preview of the computed headline once Art and Schweregrad are selected and a target is pinned. E.g. `"[Minor] Layout — Eingaben / bAV"`.

3. **`buildMarkdown.ts`** — Verify the comment text appears in the body section, not duplicated in the title.

4. Update `buildTitle.test.ts` to assert the new format (no comment in title, structured target info).

## Acceptance criteria

- [ ] Generated ticket title contains severity, type, and target label — not the comment.
- [ ] Composer header shows the computed headline as a live preview.
- [ ] Tester's comment text appears only in the ticket body.
- [ ] `buildTitle.test.ts` updated and passing.

## Blocked by

Nothing — standalone change.
