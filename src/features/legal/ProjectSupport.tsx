import { SUPPORT_PAYMENT_URL, SUPPORT_PLEDGE } from '../../content/support'

/** A plain external link keeps checkout separate from local calculator data. */
export function ProjectSupport() {
  return (
    <section className="project-support" id="unterstuetzen" aria-labelledby="project-support-title">
      <div className="project-support__copy">
        <h2 id="project-support-title">RentenWiki.de weiterentwickeln</h2>
        <p>{SUPPORT_PLEDGE}</p>
        <p className="project-support__note">
          Deine Unterstützung ist freiwillig. Die öffentliche Nutzung bleibt kostenlos.
          {' '}Es wird keine Spendenbescheinigung ausgestellt.
        </p>
      </div>
      <div className="project-support__action">
        <a
          className="project-support__link"
          href={SUPPORT_PAYMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Projekt unterstützen ↗
        </a>
        <span>Einmalig · Betrag frei wählen · über Stripe</span>
      </div>
    </section>
  )
}
