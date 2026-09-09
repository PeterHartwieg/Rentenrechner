# RentenWiki.de — UI/UX audit

Audit date: 9 September 2026  
Target: live website, https://rentenwiki.de  
Method: hands-on browser walkthrough using computer use, visual screenshots, accessibility trees, and read-only measurements of the rendered page.  
Status: audit completed; improvement options have deliberately not been evaluated.

## Assessment

The concern about overwhelming users is supported by the walkthrough. RentenWiki.de has a restrained visual identity and a substantial amount of useful information, but its main planning journey demands considerable reading and financial vocabulary before users can confidently interpret their result.

Three sources of effort compound:

1. **Reading effort:** introductions, methodological explanations, legal references, evidence caveats, and repeated metadata remain prominent during ordinary tasks.
2. **Conceptual effort:** users must distinguish gross contributions, net cost, contract income, total income, nominal amounts, purchasing power, and several kinds of scenario.
3. **Interaction effort:** some labels and destinations change meaning across journeys, and several visible controls or saved outputs do not provide the expected continuation.

The comparison view is noticeably easier to scan than the complete plan. The short savings wizard is also substantially more approachable than the profile editor. This is therefore an uneven experience, rather than uniformly excessive text on every page.

This is an expert usability assessment, not an observed user study. Statements about likely confusion or abandonment are hypotheses grounded in the observed interface. The walkthrough does not establish conversion rates, actual novice comprehension, or the correctness of the financial engine.

## Scope and test conditions

I used a separate in-app browser audit session, leaving the existing Chrome session untouched. Test inputs were synthetic: the initial age-28 profile with €75,000 annual gross income and retirement at 67, an ETF with €20,000 current capital and €200 monthly saving, and a bAV with €200 monthly gross contribution. I later entered a €3,000 desired monthly pension and created a hypothetical contribution-pause plan. These are audit fixtures, not personal financial information.

The principal viewports were 1440 × 960 for desktop and 390 × 844 for phone-sized layouts. An initial intermediate-width view was also inspected. Temporary viewport overrides were reset afterward.

| Surface / journey | Work performed |
|---|---|
| Landing page | Examined promise, competing entry points, explanation sequence, article links, trust/support content, desktop and mobile appearance. |
| New plan | Completed both onboarding steps; tested GRV estimation, ETF and bAV entry, optional details, completion, and mobile modal dismissal. |
| Profile editor | Inspected person, income, retirement, assumptions, target entry, saving, and an out-of-range age. |
| Existing contracts | Inspected summaries, inline editing, additional-product controls, provenance language, and available decisions. |
| Main plan | Examined headline, assumptions receipt, breakdown, sensitivity rows, calculation notes, and export placement. |
| Contract detail | Examined bAV KPIs, what-if table, metadata, fee chart, provenance, edit destination, desktop and mobile. |
| Hypothetical contract decision | Created “Beitragsfrei stellen”; revisited the saved item and attempted to open it. |
| Additional saving | Completed “Beiträge anpassen” through amount, bAV-offer question, and ranked results. |
| Comparison | Examined all six products; changed 5% to 3%; followed details; checked selection continuity. |
| Product configuration | Inspected ETF/bAV onboarding and insurance, Riester, AVD, and Basisrente comparison editors. Not every optional branch was expanded. |
| Capital and payouts | Inspected desktop/mobile chart, filters, legend, tooltip, and turning-point presentation. |
| Articles | Inspected index and the ETF-vs-bAV article, including its calculator handoff. The other nine articles were not individually audited end to end. |
| Method | Inspected explanatory structure, sources, assumptions, and embedded Monte Carlo results. |
| Privacy and imprint | Inspected reading layout and navigation; no legal-compliance assessment. |
| Accessibility and recovery | Sampled names/roles, keyboard focus, Escape dismissal, mobile navigation, contrast, and input validation. Not a comprehensive assistive-technology certification. |
| Sharing / print | Confirmed “Link kopiert ✓” feedback. Invoked print, but no inspectable print preview appeared in the in-app browser. Exported PDF/CSV contents and pagination remain unverified. |

## Measured reading burden

These figures describe particular rendered states, including navigation and footer text. They are not universal page lengths and do not imply that users must read every word.

| Mobile surface at 390 × 844 | Approx. rendered words | Document height | Significant position |
|---|---:|---:|---|
| Mein Plan, two contracts and a saved target | 1,082 | 6,139 px | “Zusammensetzung” begins around y=1,387; “Berechnungshinweise” around y=2,730; export detail section around y=5,389. |
| Deine Angaben, combine mode | 456 | 3,697 px | “Person” begins around y=529; “Annahmen” around y=2,232. |
| Six-product comparison | 442 | 3,446 px | Products stack into compact mobile cards. |

The plan occupies roughly 7.3 viewport heights. Its calculation-notes block alone separates the normal planning content from the detailed results/export area by several screens on mobile. The profile has fewer words but still feels demanding because its explanations contain unfamiliar concepts and surround simple inputs.

## Findings

Severity is a usability judgment: **High** means a likely obstacle to a central task or a material risk of misinterpreting results; **Moderate** means substantial friction with an available route forward. These are not the repository’s code-review P0/P1 labels.

### 01 — Ordinary inputs are explained through tax mechanics

**High · observed across desktop and mobile · comprehension**

On `/eingaben`, the Person section introduces age through “Kohortenwerte”, “Versorgungsfreibetrag”, and “Besteuerungsanteil”. The age field itself is followed by another legal-reference explanation. The tax-class field has a multi-sentence distinction between payroll tax and joint assessment in retirement. Income introduces “Vorsorgepauschale”, and retirement asks about KVdR versus voluntary GKV with statutory references in the choices.

On desktop, the right-hand “Warum wir das fragen” panel repeats much of this rationale beside the main form. The page also exposes Monte Carlo volatility and percentile-based return descriptions during ordinary profile editing.

**Likely user effect:** someone who knows their age and salary may infer that they must understand the associated tax mechanics before entering those values. Supporting text increases the perceived prerequisite knowledge instead of consistently answering practical input questions.

### 02 — Plan interpretation is interrupted by a long qualification block

**High · observed · information hierarchy**

The main result has a clearly emphasized monthly amount. Immediately afterward, “Wie belastbar ist diese Zahl?” presents separate paragraphs covering model uncertainty, the rule year, evidence quality, and sensitivity interpretation. The source-by-source pension breakdown appears after this block.

At the measured mobile size, the breakdown began around 1,387 px from the document top. At desktop size, the large result and its qualifications used almost the entire first screen. Farther down, “Berechnungshinweise” openly displays implementation-style coverage notes, legislative references, and issue numbers such as `#32` and `#72`.

**Likely user effect:** the user gets a number but must read a considerable amount before understanding what comprises it. The lower page shifts from a personal planning view into a technical reference document without a strong boundary in the reading flow.

The visible disclaimer is important and was present throughout. This finding concerns the cumulative hierarchy and repetition of the surrounding explanatory material.

### 03 — Monetary scope changes without sufficiently distinct labels

**High · directly reproduced · result comprehension**

The bAV detail page showed **€374 “Netto-Rente” per month** in the contract KPI strip. Immediately below, the “Weiterführen” row showed **€4,391** in a column also labeled **“Netto-Rente”**. €4,391 matched the total plan headline. The table does not clearly identify that change from contract income to whole-plan income at the point where the numbers are read.

The additional-saving results similarly present whole-plan-looking monthly totals under each individual candidate, while other metrics refer to a product or candidate. “Sicherheit” is itself displayed as a monthly euro amount, with its meaning left to help.

A related ambiguity exists in the contract KPI strip: “Beitrag pro Monat” and “Einzahlungen über 39 Jahre” do not explicitly distinguish the contribution basis from net personal cost.

**Likely user effect:** users can interpret a total-plan figure as income produced by one contract, or compare amounts whose scope differs. This is a more consequential problem than verbosity alone.

### 04 — Purchasing-power language and assumption labels do not form a consistent story

**High · observed UI inconsistency; engine correctness not assessed · trust**

The plan describes the result as “Nominale Auszahlung in heutiger Kaufkraft — keine Inflationsanpassung in den Annahmen.” Profile and method pages describe the return presets as real returns. The plan’s receipt showed inflation at 0%, while the desktop footer stated “5 % Rendite p.a., 2 % Inflation”. That footer also remained on the money-breakdown page after selecting the 3% scenario.

The sensitivity row for a change to 3% inflation showed **±0 €/Mon.** The adjacent prose explains that the displayed figures are nominal and that purchasing power can still change.

**Likely user effect:** the most prominent zero can be read as “inflation does not affect my outcome”. Readers must reconcile real returns, nominal payouts, today’s purchasing power, and a conflicting footer assumption themselves. This audit does not determine which numerical model is intended or correct.

### 05 — The primary mobile results destination is not an operative navigation link

**High · directly reproduced · navigation**

The mobile bottom navigation exposes Start, Angaben, Artikel, and Methode as links, but “Vergleich” or “Mein Plan” as plain text. This remained true on other pages, including privacy and contract detail. A tap on the central “Vergleich” item while on the privacy page did not navigate.

**Likely user effect:** the navigation promises a direct return to results but does not deliver it. Some pages have a separate return link; on others the user must detour through another route. This also affects keyboard and accessibility-tree navigation because the item is not exposed as a link.

### 06 — Mode and task labels blur comparison with inventory management

**High · observed · orientation**

The landing page offers “Plan erstellen” and “Vergleich starten” without a concise explanation of their different outcomes. In the comparison journey, the editor still says “Mein Plan · Schritt 1 von 2”, “Deine Verträge”, and “Speichern und Plan ansehen”. Its introduction asks for contracts the user already owns even when the user is comparing possible products.

The initial plan wizard finishes with “Fertig & Vergleich starten”, although its destination is Mein Plan. Returning to profile editing reintroduces a step sequence marked current/outstanding, despite an already completed plan.

**Likely user effect:** users need to learn the application’s modes through trial and error. They cannot consistently infer whether they are describing existing holdings, comparing new options, or altering a saved plan.

### 07 — Comparison scope does not visibly follow selection or topic intent

**High · directly reproduced · task continuity**

After opening a six-product comparison, I followed Angaben into the product editor. It stated that no contracts were selected. I then added private insurance, Riester, AVD, and Basisrente and saved. The comparison still displayed all six products; the method page’s Monte Carlo panel, by contrast, displayed the four selected products.

I also followed “ETF und bAV jetzt vergleichen” from the ETF-vs-bAV article. The destination again presented “Sechs Wege, fürs Alter zu sparen” with six products, rather than visibly focusing on the pair named in the action.

**Likely user effect:** selection has uncertain meaning, and a focused question broadens into more choices. Users cannot confidently tell which inputs control which result surface. These observations are specific to the tested session; the underlying state/implementation cause was not investigated.

### 08 — Creating an alternative does not provide a clear route to evaluating it

**High · directly reproduced · completion and feedback**

Through a bAV’s “Weitere Optionen”, I selected “Beitragsfrei stellen” and created one plan. A “Beitragsfrei stellen” item appeared under “Was-wäre-wenn-Pläne”. Clicking that item did not open a result or change the interface. Saving and returning to Mein Plan continued to show the baseline €4,391 result with the bAV active.

The contract detail table lists alternatives such as “Beitrag erhöhen”, but clicking the tested row also did not trigger an action. The baseline row has a small triangular marker that can resemble a disclosure affordance.

**Likely user effect:** the user receives evidence that an alternative exists but no obvious way to view its effect. This leaves the central exploration loop feeling unfinished. The saved alternative was still present after revisiting the page, so the observed issue is access/continuation rather than proven failure to save.

### 09 — “Beiträge anpassen” opens a different task than its label suggests

**Moderate · directly reproduced · action expectations**

The action opens a three-step modal titled “Lücke schließen”, asking how much additional money to save, then whether there is a bAV offer, then showing ranked options. It does not initially open editing of existing contributions.

Entering a desired pension of €3,000 made the main plan’s assumptions receipt contain nine values, but the main result did not visibly compare the €4,391 outcome with that target. The additional-saving journey still uses gap-closing language.

**Likely user effect:** someone intending to reduce or adjust a current payment is taken into an additional-saving journey. The relationship between a entered target, an actual gap, and the offered action is not evident.

### 10 — Ranking visuals communicate stronger judgments than nearby language

**High · observed; interpretation is a usability hypothesis · trust**

The comparison says “Wir nennen keine Empfehlung”, yet sorts products by the monthly result and uses bars to emphasize the ordering. Lifetime pension and capital-drawdown products share that headline comparison, with important duration differences carried in secondary copy or elsewhere.

The savings wizard displays a “Relative Bewertung” of 100% for the leading option and smaller percentages for the others. The method page shows “Bestes Kapital” and “Beste Rente” percentages. A manually created contribution-pause alternative was labeled “Empfehlung” in the saved-plan list.

**Likely user effect:** users may read these as overall suitability, certainty, or endorsement. The surrounding explanations qualify the numbers but do not necessarily control the first impression made by the ranked visual presentation.

### 11 — Onboarding promises a short task but hides considerable work inside step two

**Moderate · observed · effort estimation**

“Schritt 1 von 2” is a reasonably bounded profile form. “Schritt 2 von 2” becomes a long inventory as products expand. Even without advanced bAV details, users encounter contract start, current value, contribution, status, provider, Durchführungsweg, effective costs, payout form, and guaranteed pension factor.

At phone size, the GRV section alone occupies most of the scrollable area before the first optional product. The sticky modal header and footer preserve navigation but reduce the visible field area. Step two provides cancellation/completion, but no explicit back-to-step-one button was visible in the tested inventory wizard.

**Likely user effect:** two steps understate the variable work involved. “Nur die wichtigsten Werte — den Rest schätzen wir” helps, but it does not fully resolve which visible specialist fields can safely remain unknown.

### 12 — Evidence labels require interpretation and can overstate verification

**Moderate · observed · confidence and data quality**

The interface uses “Schätzung”, “Übernehmen”, “Bestätigt”, “Modellwert”, “Standardwert”, and explanatory “geprüft” language. Typing the synthetic ETF capital immediately produced “Bestätigt”. Contract detail explains “Modellwert” and “geprüft” but the actual bAV list displayed “Standardwert” throughout. That list names input categories without showing their values alongside the labels.

**Likely user effect:** entering a value, accepting an estimate, checking a document, and verifying correctness may be conflated. Users must also move elsewhere to connect a listed input’s confidence with its numerical value.

### 13 — There are concrete contrast and overflow defects

**High · visually observed and partly measured · readability**

The ETF-vs-bAV article’s primary calculator link renders dark red text on a near-black background. Computed colors were `rgb(138,46,46)` and `rgb(26,22,18)` at 15.2 px, yielding approximately **2.15:1 contrast**. It was visibly difficult to read.

On the desktop bAV detail page, the Durchführungsweg appeared as the internal identifier `direktversicherung_3_63` and extended outside the right-hand metadata panel. The inventory summary also showed cramped/wrapped metadata near its adjacent action column.

**Likely user effect:** a primary action is easy to overlook, while a raw technical value and panel overflow weaken confidence in the interface. This was a sampled contrast check, not a complete contrast inventory.

### 14 — Charts reduce prose but still demand a technical reading strategy

**Moderate · observed · visual comprehension**

The lifecycle chart simultaneously distinguishes net paid-in, remaining capital, cumulative payouts, GRV lines, break-even, and a lifetime-pension crossover marker. The desktop legend occupies part of the chart; on mobile it sits below a tall chart in small text. Two similar headings introduce the chart: “Kapital und Auszahlungen über das Leben” and “Kapital und Auszahlungen im Alter”.

The page extends to age 100 while the assumptions receipt labels age 90 as the model end age and the turning-point table calls age 90 “Voraussichtliches Vertragsende”. The plotted lines may have reasons to continue, but the labels leave users to reconcile these horizons.

**Likely user effect:** the chart is useful after understanding the model, but not self-explanatory on first encounter. The mobile turning-point cards are considerably easier to read than the full legend and line system.

### 15 — The interface mixes several visual and linguistic levels of expertise

**Moderate · observed · consistency and scanning**

Editorial serif headings, monospaced uppercase metadata, numbered paragraphs, dense technical cards, plain forms, and emoji confidence badges coexist. On the desktop profile page, two side rails constrain the form’s central column while adding more explanatory text. On the plan page, the relatively sparse headline area gives way to dense white implementation-note cards farther down.

Some helper text is direct and practical; other copy uses “Statutorische Werte”, “Apportionierung”, “Glidepath”, “Seed”, “Baseline”, and “annuitisiert”. The insurance editor also changes from the usual informal “du” to “Ihrem persönlichen Steuersatz”. JSON export is displayed as a prominent action at the end of ordinary editing forms.

**Likely user effect:** users repeatedly adjust their reading strategy and infer that advanced technical understanding may be expected. The individual components are often orderly, but their combination gives insufficient guidance about the intended depth of engagement.

### 16 — Educational content has good navigation but also adds reading and trust inconsistencies

**Moderate · observed on index and sampled article · learning support**

The article index is organized into understandable topics. The sampled article provides an in-page contents list, an example person, tables, sources, and a calculator entry point. These are useful learning structures.

However, its headline is long and technically framed (“gleicher Nettokostenbasis 2026”), with an eleven-item contents list and two sidebars. Several article-index descriptions already use statutory references and specialist tax terms. The comparison’s static pros/cons can also conflict with its dynamic numbers: private insurance was described as having the highest costs at about 1.2% annually while the same comparison showed lower costs for it than for Basisrente and Riester.

**Likely user effect:** users who seek a simpler explanation may encounter another expert-oriented document, and discrepancies between generic copy and personal results create extra interpretation work.

## Strengths observed

- **Recognizable visual identity:** restrained colors, generous space, and coherent typography give the product a serious, independent feel.
- **Prominent result:** the main monthly pension amount is visually easy to find once the user reaches it.
- **Useful comparison formatting:** aligned desktop numbers and small relative bars support scanning. Mobile product cards preserve a usable compact summary.
- **Accessible entry without documents:** GRV estimates and product defaults allow an illustrative plan to be completed with incomplete information.
- **Focused savings steps:** the amount-selection step, with three presets and a custom amount, is direct and easy to operate.
- **Some effective progressive disclosure:** advanced product settings, evidence help, and mobile assumptions receipts reduce initial clutter locally.
- **Meaningful validation:** entering age 150 showed an inline explanation that the value would be limited to 66; the input remained editable. This was a handled boundary, not a page failure.
- **Working modal recovery:** Escape closed the tested menu and inventory modal. The mobile menu returned focus to its trigger.
- **Clear copy feedback:** the share action visibly changed to “Link kopiert ✓”.
- **Transparent foundations:** no sign-up gate, visible disclaimers, source links, local-storage messaging, and explicit assumptions all support informed use.
- **Mobile adaptations exist:** contract KPIs become a grid; plan rows and chart turning points stack; secondary receipts collapse.

## Cross-journey conclusion

The most demanding point is not the landing page alone. It is the transition from a welcoming question to a profile form that explains tax mechanics, followed by a result that requires users to reconcile scope, assumptions, confidence, and modes.

Text density is a substantial part of the problem, but removing words alone would leave important ambiguities unresolved. The highest-severity findings concern result interpretation, continuity between setup and results, the ability to revisit alternatives, and mobile navigation. These are findings about the current experience; no redesign direction or implementation priority has been selected in this audit.

## Limits and unresolved checks

- No representative novice or expert participants were observed, so differences in actual comprehension and task completion remain unmeasured.
- Financial, tax, and legal correctness were not validated. Apparent contradictions are reported as interface inconsistencies.
- Tests used one primary synthetic household. Partner, PKV, civil-service, professional-pension, multi-child, and complex transfer combinations were not exhaustively exercised.
- This was responsive browser testing, not physical-device testing with a software keyboard or touch assistive technology.
- Accessibility checks were sampled; there was no full VoiceOver/NVDA walkthrough or complete focus-order/contrast audit.
- The print action did not expose an inspectable preview in the audit browser. No conclusion is made about PDF layout, CSV contents, or export correctness.
- One educational article was inspected in depth; the ten-article corpus was not fully fact-checked or individually audited.
- The deployed site was audited as observed on this date. It was not assumed to be identical to the current repository checkout.
- No application code, calculations, deployment, or user-owned Chrome data were changed.

## Main page references

- [Landing](https://rentenwiki.de/?view=landing)
- [Plan / comparison, depending on active mode](https://rentenwiki.de/)
- [Profile](https://rentenwiki.de/eingaben)
- [Contracts](https://rentenwiki.de/eingaben/produkte)
- [Capital and payouts](https://rentenwiki.de/kapital)
- [Comparison breakdown](https://rentenwiki.de/vergleich/details)
- [Article index](https://rentenwiki.de/artikel)
- [ETF-vs-bAV article](https://rentenwiki.de/etf-vs-bav/)
- [Method](https://rentenwiki.de/methode)

Contract-detail URLs contain session-created instance IDs, so reproducing those screens requires creating equivalent test contracts first.
