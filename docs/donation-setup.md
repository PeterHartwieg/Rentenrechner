# Project support setup

Status: **PayPal contribution page published**, verified 9 September 2026.

Public contribution link: https://www.paypal.com/donate/?hosted_button_id=GFTZUZ9PVWH9G

PayPal hosted button ID: `GFTZUZ9PVWH9G`.
Manage it under PayPal → donation pages, or
https://www.paypal.com/donate/buttons/manage/GFTZUZ9PVWH9G .
The existing personal account belongs to Peter Hartwieg in Germany.
Its login is stored in the private Employee vault in 1Password; credentials
must not be added to this repository.

## Provider decision

Peter chose direct **PayPal** support after Stripe rejected the appeal for
this activity on 9 September 2026. The old Stripe checkout must not be
republished. The Stripe follow-up automation was removed when the appeal
was resolved; no further appeal or scheduled monitoring is pending.

PayPal's donation-page tool supports personal accounts. It avoids an extra
creator-platform account and platform fee. Standard PayPal processing fees
still apply; do not assume registered-charity pricing or use friends-and-family
to avoid fees. The public page was verified to offer PayPal and debit/credit
card payment. Apple Pay is not advertised for this configuration.

This funds a freely available, source-available calculator under PolyForm
Noncommercial. It does not purchase a commercial licence or make Peter a
registered charity. No charitable donation receipt is issued.

Sources:

- [PayPal donation pages and personal-account support](https://www.paypal.com/donate/buttons)
- [PayPal Germany merchant fees](https://www.paypal.com/de/business/paypal-business-fees)
- [PayPal privacy policy](https://www.paypal.com/de/legalhub/paypal/privacy-full)

## Verified checkout configuration

- Recipient displayed publicly: **Peter Hartwieg**.
- Management page name: `RentenWiki.de freiwillig unterstützen`.
- Public purpose (PayPal limits this field to 127 characters): `Dein Beitrag fließt nach Abzug der Zahlungsgebühren vollständig in die Weiterentwicklung von RentenWiki.de.`
- EUR, any supporter-chosen amount, one-off only; recurring contributions off.
- Optional fee top-up, postal-address collection, donor messages and project-selection fields off.
- Completion and cancellation return to `https://rentenwiki.de/#unterstuetzen`.
- No extra HTML variables, payment SDK, backend, webhook or calculator data transfer.
- Public checkout inspected signed in and signed out, without submitting a payment.

The website provides the fuller pledge before checkout:

> Alle Unterstützungsbeiträge fließen nach Abzug der Zahlungsgebühren zurück in die Weiterentwicklung von RentenWiki.de.

It also states that support is voluntary, public use remains free, and no
Spendenbescheinigung is issued. PayPal still processes payment/contact and
technical data needed for checkout; optional postal-address collection being
off does not imply that payment-method billing information is never needed.

## Website, GitHub and maintenance

`SUPPORT_PAYMENT_URL` in `src/content/support.ts` is the public checkout URL,
not a credential. Never replace it with a test link or append calculator state.

`.github/FUNDING.yml` and README retain the stable public URL
`https://rentenwiki.de/#unterstuetzen`. GitHub therefore leads to the project
pledge and the current provider, without needing a funding-file change for
each provider switch. See [GitHub sponsor button configuration](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

The website uses a plain external link with `noopener noreferrer` and
`referrerPolicy="no-referrer"`. Its privacy notice names PayPal (Europe)
S.à r.l. et Cie, S.C.A., Luxembourg. Calculator input stays local.

For changes, inspect the public checkout, currency, amount controls, recipient
and pledge without making a real payment. Run `npm run verify`, check the
support section on desktop and mobile, merge through normal repository checks,
and verify the production link and GitHub funding URL.
