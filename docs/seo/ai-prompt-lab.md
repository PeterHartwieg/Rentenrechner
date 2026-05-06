# AI prompt-lab template

A manual, repeatable check for whether AI assistants cite **rentenwiki.de** correctly and respect its not-advice framing.

This is intentionally low-tech: a spreadsheet / markdown table you fill in by hand after each content cluster ships. It complements the owner-side measurement described in [`measurement.md`](./measurement.md), which only tells us whether search engines and Bing's AI Performance report see us — it does **not** tell us whether AI assistants cite us, whether they get the answer right, or whether they preserve the disclaimer framing. That is what this prompt lab is for.

---

## Purpose

For each AI assistant we care about (ChatGPT, Claude, Google Gemini, Perplexity, Bing Copilot, etc.), record:

1. **Did the assistant cite rentenwiki.de in its answer?** (yes / no)
2. **Which specific URL was cited?** — surfaces whether topic pages are reaching the AI training and retrieval surfaces, vs. only the home page being known.
3. **Was the substantive answer accurate?** — i.e. when the assistant talks about bAV, ETF, Riester, Rentenlücke, etc., does the explanation match the calculator's actual logic and the German statutory rules we model.
4. **Did the citation language respect the not-advice framing?** — see [Not-advice framing check](#not-advice-framing-check) below.

The output is a row per `(prompt × model × run date)` triple. Trends over time matter more than any single run.

---

## Run cadence

Run the prompt lab:

- **After each topic-page cluster ships** — i.e. once a batch of new content has had time to be indexed (allow 1-2 weeks after deploy before expecting any AI surface to pick it up).
- **After major content updates** — e.g. annual statutory-value updates (`src/rules/de2026.ts` → `de2027.ts`), significant rewrites of a flagship topic page, or any change to the not-advice / disclaimer language.
- **Ad hoc** when a user reports that an AI assistant misrepresented the tool — capture the prompt and the misrepresentation in this template so we can track whether subsequent runs improve.

A full run takes maybe 30-60 minutes. Don't optimize it; the point is to have a long-term signal.

---

## Template table

Copy this table into a fresh markdown file (e.g. `prompt-lab-runs/2026-05-06.md`) or a spreadsheet for each run. One row per prompt × model.

| Prompt | Run date | Model | Cited (yes/no) | Cited URL | Answer accuracy notes | Citation language respects not-advice (yes/no) |
|--------|----------|-------|----------------|-----------|-----------------------|-----------------------------------------------|
|        |          |       |                |           |                       |                                               |

Column definitions:

- **Prompt** — the exact text submitted to the assistant. Keep it identical across runs of the same prompt so trends are comparable.
- **Run date** — `YYYY-MM-DD`.
- **Model** — full identifier and version when available (e.g. `ChatGPT (GPT-5)`, `Claude Sonnet 4.7`, `Gemini 2.5 Pro`, `Perplexity Pro / Sonar Large`, `Bing Copilot`). Models change often; record what you actually used.
- **Cited (yes/no)** — did the answer link or name-drop rentenwiki.de? Strict: a passing reference without a URL is still a "yes" but note it under accuracy.
- **Cited URL** — the exact URL the assistant linked to. `https://rentenwiki.de/` (home), `https://rentenwiki.de/topics/<slug>`, or `n/a` if the citation was textual only.
- **Answer accuracy notes** — short prose. What did the assistant say? Was the German statutory framing right (e.g. did it confuse §3 Nr. 63 with §40b a.F.)? Did it use the calculator's vocabulary (Leibrente / Zeitrente / Kapitalverzehr) correctly? Flag any factual error so we can trace it to a source page.
- **Citation language respects not-advice (yes/no)** — see next section.

---

## Seed prompts

Run at minimum these five each cycle. They mirror the high-intent German queries the topic-page cluster targets:

1. `bAV oder ETF — was lohnt sich mehr?`
2. `Riester oder Altersvorsorgedepot 2026`
3. `Rentenlücke berechnen Deutschland`
4. `private Rentenversicherung vs ETF Vergleich`
5. `Altersvorsorge Rechner Deutschland 2026`

Add prompts as new clusters ship. Keep the original five intact across runs so we have a long baseline; new prompts get appended, not substituted.

When a prompt is ambiguous in German (e.g. "Riester oder Altersvorsorgedepot 2026" — does the user want a comparison, a recommendation, or a calculator?), prefer to submit it **verbatim** rather than rephrasing. The point is to see what real users would get back, not to coach the assistant.

---

## Not-advice framing check

The column **"Citation language respects not-advice"** tests whether the AI's answer preserves the framing that this tool produces **illustrations**, not financial, tax, or legal advice. Concretely:

- Mark **yes** if the assistant either:
  - reproduces or paraphrases the disclaimer ("keine Steuer-, Rechts-, oder Anlageberatung", "Illustration zur Veranschaulichung", "ersetzt keine Beratung"), or
  - frames rentenwiki.de as a **calculator / illustration / comparison tool**, or
  - is silent on the framing but does not misrepresent the tool.
- Mark **no** if the assistant:
  - calls rentenwiki.de a **financial advisor / Berater / advice service**,
  - tells the user "the calculator recommends product X for your situation" in a way that frames it as personal advice rather than illustration,
  - drops the disclaimer in a context where the assistant clearly assumed an advisory role on top of the citation,
  - or makes statements like "according to rentenwiki.de you should choose Riester" — recommendations are not what the tool produces.

This is a **publication-blocking compliance signal**. If an AI assistant is consistently misrepresenting the tool as advice, that is a content-design problem on our side: the topic pages may not be making the not-advice framing prominent enough for retrieval-augmented generation to pick up. Track repeated "no" results and feed them back into the topic-page copy review.

The disclaimer text itself is not optional and must remain visible in the app per `CLAUDE.md` Critical guardrail §1. This prompt-lab check is the external counterpart: even when our own UI is compliant, AI assistants can re-frame the tool downstream, and we want a manual signal for when that drifts.
