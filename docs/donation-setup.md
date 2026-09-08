# Project support setup

Status: **draft, payment account activation pending** (8 September 2026).
No live checkout has been created or verified. Do not merge/publish this
change until the activation steps below are complete.

## Provider decision

Use **Stripe Payment Links**, in EUR, for voluntary one-off support of the
freely available RentenWiki.de calculator. Peter confirmed receipt as an
individual in Germany, with Peter Hartwieg displayed as the recipient.
Account email: `peter@hartwieg.com`.

| Option | Current published fees / fit | Decision |
| --- | --- | --- |
| Stripe Payment Links | Standard EEA cards: 1.5% + €0.25; no setup/monthly fees on standard Payments pricing. Hosted checkout with customer-chosen amount. Other payment methods/cards can cost more. | Best fit: one provider, branded checkout, no extra platform fee. |
| Ko-fi | 0% platform fee for one-off tips with Contributor status off, plus Stripe/PayPal fees. New accounts start as Contributors (5%); recurring support and other features may carry fees. | Useful if a creator profile/community becomes important; an extra account is unnecessary for this link. |
| PayPal | Published German domestic donation rate: 2.49% + fixed fee; the actual rate depends on the payment product used. | Possible later addition for visitors who prefer PayPal. Do not assume charity discounts or use friends-and-family to avoid fees. |
| GitHub Sponsors | Personal-account sponsorships have no GitHub fee; participation is oriented toward open-source contributors and requires application/payout setup. | Do not make this source-available, non-commercial project depend on Sponsors eligibility. Use the repository's external funding link instead. |
| Buy Me a Coffee | 5% platform fee plus processing fees. | Adds cost and another account without a needed feature. |

Sources checked on 8 September 2026:

- [Stripe Germany pricing](https://stripe.com/de/pricing)
- [Stripe Payment Links creation and customer-chosen prices](https://docs.stripe.com/payment-links/create?pricing-model=standard)
- [Stripe requirements for tips and donations](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations?locale=en-GB)
- [Ko-fi fees](https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee)
- [Ko-fi Contributor status](https://help.ko-fi.com/hc/en-us/articles/25143210488477-Contributor-status)
- [PayPal Germany merchant fees](https://www.paypal.com/de/business/paypal-business-fees)
- [GitHub Sponsors eligibility and fees](https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/about-github-sponsors-for-open-source-contributors)
- [Buy Me a Coffee fees](https://help.buymeacoffee.com/en/articles/4539170-frequently-asked-questions)

Stripe distinguishes tips for an already-provided service from charitable
donations. Describe this as voluntary support for the free calculator;
do not represent Peter as a registered charity or promise a charitable
donation receipt. A contribution does not buy a commercial license.

## Checkout configuration

- Live account, verified recipient: Peter Hartwieg; public project: RentenWiki.de.
- Product name: `RentenWiki.de freiwillig unterstützen`.
- Description: `Alle Unterstützungsbeiträge fließen nach Abzug der Zahlungsgebühren zurück in die Weiterentwicklung von RentenWiki.de. Deine Unterstützung ist freiwillig. Die öffentliche Nutzung bleibt kostenlos. Es wird keine Spendenbescheinigung ausgestellt.`
- One-off payment, EUR, customer chooses amount; suggested €5, minimum €1.
- Confirmation: `Vielen Dank! Dein Beitrag fließt nach Abzug der Zahlungsgebühren zurück in die Weiterentwicklung von RentenWiki.de.`
- Use normal payment receipts; no paid invoice-generation add-on or recurring subscription.
- Do not request shipping addresses, phone numbers, calculator inputs or custom fields.
- Link to `https://rentenwiki.de/datenschutz/` and `https://rentenwiki.de/impressum/` where supported. Verify the actual checkout data collection against the privacy copy before publishing.
- Do not misclassify the activity as a charity or select tax exemptions without a factual basis. Peter must supply any required account, tax and payout details.

## Activation

1. Peter signs in to an existing appropriate Stripe account, or completes registration, account verification and payout-bank setup. The browser account-opening policy requires user handoff for a new financial account. The accessible command-line 1Password vault had no Stripe/PayPal credentials; the native 1Password app was locked.
2. Create the live Payment Link with the configuration above. Verify that its public checkout shows the correct recipient, EUR, a freely chosen amount, one-off payment and the development pledge. Do not make a real payment as part of verification.
3. Set `SUPPORT_PAYMENT_URL` in `src/content/support.ts` to the verified live URL. It is deliberately `null` until then: no invented, test or inactive checkout is shown to visitors.
4. Review the payment-data section of the privacy page against the activated account's actual settings and record applicable retention/legal basis if required by those settings. It is only rendered once the live payment link is configured.
5. Run `npm run verify`; inspect the support section on desktop and phone and open the external checkout from the final build.
6. Merge the PR, verify production deployment, and enable/verify repository Settings → General → Features → Sponsorships. Confirm the Sponsor button displays the support URL on the default branch.

The repository's `.github/FUNDING.yml` and README use the stable public
URL `https://rentenwiki.de/#unterstuetzen`. This points to the project-use
pledge before checkout and keeps GitHub working if the provider URL later
changes. Website checkout is a plain external link with no referrer and
no calculator state or identifiers appended. No payment SDK, webhook,
backend, cookie, tracking request or account is added to the calculator.

GitHub's configuration is documented in [Displaying a sponsor button](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).
