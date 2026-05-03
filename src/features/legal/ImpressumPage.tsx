import type { Route } from '../../app/useRoute'
import { LegalLayout } from './LegalLayout'

interface Props {
  navigate: (target: Route) => void
}

export function ImpressumPage({ navigate }: Props) {
  return (
    <LegalLayout title="Impressum" navigate={navigate}>
      <p className="legal-intro">
        Angaben gemäß § 5 TMG (Telemediengesetz).
      </p>

      <section>
        <h2>Anbieter</h2>
        <address>
          Peter Hartwieg<br />
          Tölzer Str. 5a<br />
          81379 München<br />
          Deutschland
        </address>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail:{' '}
          <a href="mailto:peter@hartwieg.com">peter@hartwieg.com</a>
        </p>
      </section>

      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>
          Peter Hartwieg, Anschrift wie oben.
        </p>
      </section>

      <section>
        <h2>Hinweis zur beruflichen Stellung</h2>
        <p>
          Der Anbieter dieses Dienstes ist <strong>weder Steuerberater, noch
          Versicherungsvermittler oder -berater im Sinne der §§&nbsp;34d, 34e GewO
          noch Anlageberater oder Vermögensverwalter im Sinne des KWG / WpIG /
          WpHG</strong>. Es besteht keine berufsrechtliche Aufsichtsbehörde, da
          keine erlaubnispflichtige Tätigkeit ausgeübt wird. Dieser Dienst ist
          eine Modellrechnung zur persönlichen Information und ersetzt keine
          individuelle Beratung.
        </p>
      </section>

      <section>
        <h2>Haftungsausschluss</h2>
        <h3>Haftung für Inhalte</h3>
        <p>
          Die Inhalte dieser Anwendung wurden mit größter Sorgfalt erstellt.
          Für die Richtigkeit, Vollständigkeit und Aktualität der Berechnungen
          und Annahmen kann jedoch keine Gewähr übernommen werden. Der Dienst
          stellt eine Modellrechnung dar und ersetzt keine individuelle
          Steuer-, Rechts- oder Anlageberatung. Eine Haftung für entgangene
          Leistungen, Steuerersparnisse oder Renditen sowie für Entscheidungen,
          die auf den Ergebnissen der Anwendung beruhen, ist ausgeschlossen,
          soweit gesetzlich zulässig.
        </p>
        <h3>Haftung für Links</h3>
        <p>
          Diese Anwendung enthält ggf. Links zu externen Webseiten Dritter, auf
          deren Inhalte der Anbieter keinen Einfluss hat. Für die Inhalte der
          verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich.
          Bei Bekanntwerden von Rechtsverletzungen werden derartige Links
          umgehend entfernt.
        </p>
      </section>

      <section>
        <h2>Urheberrecht und Lizenz</h2>
        <p>
          Der Quellcode dieser Anwendung wird unter der{' '}
          <strong>PolyForm Noncommercial 1.0.0</strong> Lizenz veröffentlicht.
          Persönliche, nicht-kommerzielle Nutzung ist kostenlos. Eine kommerzielle
          Nutzung — insbesondere durch Versicherungsvermittler, Anlageberater,
          Banken oder Arbeitgeber — bedarf einer separaten kostenpflichtigen
          Lizenz. Anfragen bitte an{' '}
          <a href="mailto:peter@hartwieg.com">peter@hartwieg.com</a>.
        </p>
      </section>

      <section>
        <h2>EU-Streitschlichtung</h2>
        <p>
          Die Europäische Kommission stellt eine Plattform zur
          Online-Streitbeilegung (OS) bereit:{' '}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://ec.europa.eu/consumers/odr/
          </a>. Der Anbieter ist nicht bereit oder verpflichtet, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </p>
      </section>
    </LegalLayout>
  )
}
