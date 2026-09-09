# Independent review comparison

Both reviewers acted as first-time users with little financial and IT knowledge. Each received the interface and the same tasks, without source code, prior design rationale or the other's findings. These are AI role-play reviews, not a study with real novice participants.

## Shared findings

| Theme | Astra | Fable 5.1 | Interpretation |
|---|---|---|---|
| Short first journey | Calm and approachable; known inputs easy | Low input burden; four fields plus one pension-history input | Keep the short default journey. |
| Contribution years | Initially deferred; later guessed 12 years | Guessed 12 years | Fewer fields alone does not remove difficulty. This question needs a usable unknown/estimation path. |
| Optional detail | Easy to find, hard to answer costs/end age | Labels and method sections do not explain enough | Add concise, contextual help where a user must decide or find information. |
| Payout duration | Prominent total may seem lifelong | “Bis 90” leaves “what happens after?” unanswered | Keep the distinction visible and explain the consequence briefly. |
| Alternatives | Original preserved; saved item required searching | Smoothest flow; original preserved | Keep the before/after flow; make remembered alternatives easier to return to. |
| Saving | Reload limitation discovered late | Expected saving/sharing or applying an alternative | Distinguish prototype-only persistence limits from the intended production design. |

## Findings that differ

Astra's highest-priority issue is helping someone who does not know their contribution history. It also directly observed an unknown payout age becoming “Bis 90” without clearly identifying that as an assumption.

Fable's strongest concern is trust: input forms resemble a personal calculator, while static pension figures and changing illustrative contract amounts create conflicting signals. It also noticed inconsistent product names, the indirect back path from the pension editor, the absence of a remove-contract action, and an unrelated capital example reached from “your plan.”

These prototype-specific findings should not be misreported as failures of the real calculation engine. The mockup deliberately does not calculate personal retirement outcomes. In particular, Fable's proposed wording “Grob geschätzt aus deinen Angaben” must not be applied to the current demonstration figures. Any future result explanation must truthfully describe the actual calculation and assumptions.

## Evidence limits

- Astra completed a 390 × 844 phone inspection. Fable attempted resizing, but its reported viewport did not change; Fable supplied no valid mobile observations.
- Fable encountered an initially unresponsive tab, ineffective wheel scrolling and an empty accessibility reader. It subsequently completed the desktop tasks in another tab. Those observations remain possible browser-tool/preview-environment problems, not confirmed product defects or a screen-reader audit.
- Fable interpreted the comparison's €150 default as carried over from the ETF. Seeing equal values alone does not establish that data flow; treat that as the reviewer's impression.
- No implementation changes were made in response to these reviews.

## Most useful next design pass

Keep the reduced input burden. Resolve the few remaining points that require guessing: contribution history, important assumptions, what the headline includes and how long each part pays. Use brief explanations at those decision points, consistent product names and clearer return/remove/saved-alternative actions. Keep demonstration-specific notices separate from the intended production wording without misrepresenting the example figures as personal calculations.
