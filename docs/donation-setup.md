# Project support setup

Status: **live Stripe checkout active**, verified 9 September 2026.

Public contribution link: https://buy.stripe.com/9B6dR32A0gfi0bx4NxcIE00

Stripe Payment Link ID: `plink_1UDegc9rzdMM6w6Xdp7YsPcQ`. Peter completed
registration and live-account activation. The public checkout was inspected
without submitting a payment.

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

## Verification and maintenance

1. The live Payment Link is active and offers a suggested €5, minimum €1, no maximum, and EUR customer-chosen one-off contributions. Managed Payments, automatic tax collection, additional customer-name/address/phone collection, paid invoice PDFs and adding the link to a Stripe profile were left off. Existing payment methods remain available.
2. `SUPPORT_PAYMENT_URL` in `src/content/support.ts` contains the verified live URL. It is a public checkout URL, not a credential. Never replace it with a test link or append calculator state.
3. Public business branding uses RentenWiki.de, with `peter@hartwieg.com` for support and the website's Impressum and privacy URLs. Stripe may collect payment-method details even though optional extra collection is disabled. The website privacy section describes this and statutory retention separately from local calculator data.
4. For future changes, inspect the public checkout, amount controls and pledge; do not submit a real payment without an explicit payment instruction. Run `npm run verify` and check desktop/phone layouts before release.
5. Merge through the repository's normal checks, verify the production deployment, and confirm GitHub's Sponsor button displays the support URL on the default branch.

The repository's `.github/FUNDING.yml` and README use the stable public
URL `https://rentenwiki.de/#unterstuetzen`. This points to the project-use
pledge before checkout and keeps GitHub working if the provider URL later
changes. Website checkout is a plain external link with no referrer and
no calculator state or identifiers appended. No payment SDK, webhook,
backend, cookie, tracking request or account is added to the calculator.

GitHub's configuration is documented in [Displaying a sponsor button](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

Privacy sources: [Stripe privacy policy](https://stripe.com/de/privacy), [Stripe service provider in Europe](https://support.stripe.com/questions/stripe-service-provider-in-ireland?locale=en-GB), [GDPR Article 6](https://eur-lex.europa.eu/eli/reg/2016/679/oj/?locale=de), and [§ 147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html).
