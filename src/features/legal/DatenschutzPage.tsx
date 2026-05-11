import type { Route } from '../../app/useRoute'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../storage'
import { LIBRARY_KEY } from '../../data/scenarioLibrary'
import { WORKSPACE_KEY } from '../../app/useWorkspace'

/**
 * Legacy localStorage key from the removed Geführter-Einstieg feature.
 * No longer written, but listed here for transparency since users from the
 * pre-merge build may still have a stale entry until they clear browser data.
 */
const LEGACY_SETUP_FLAG_KEY = 'rentenrechner-guided-setup-v1'
import { DISMISS_KEY } from '../workspace/DisclaimerBanner'
import { LegalLayout } from './LegalLayout'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

interface Props {
  navigate: (target: Route) => void
}

export function DatenschutzPage({ navigate }: Props) {
  const { targetProps: headerProps } = useFeedbackTarget({
    id: 'legal.datenschutz.header',
    label: 'Datenschutzerklärung Kopfzeile',
    precision: 'section',
  })
  const { targetProps: contactProps } = useFeedbackTarget({
    id: 'legal.datenschutz.contact',
    label: 'Datenschutzerklärung Verantwortlicher',
    precision: 'section',
  })
  const { targetProps: bodyProps } = useFeedbackTarget({
    id: 'legal.datenschutz.body',
    label: 'Datenschutzerklärung Grundsatz',
    precision: 'section',
  })
  const { targetProps: storagePolicyProps } = useFeedbackTarget({
    id: 'legal.datenschutz.storagePolicy',
    label: 'Datenschutzerklärung lokale Speicherung',
    precision: 'section',
  })

  return (
    <LegalLayout title="Datenschutzerklärung" navigate={navigate}>
      <p className="legal-intro" {...headerProps}>
        Stand: Mai 2026. Diese Erklärung beschreibt den aktuellen technischen
        Zustand der Anwendung und wird aktualisiert, sobald sich die
        Verarbeitung personenbezogener Daten ändert (z.&nbsp;B. durch die
        Einführung eines Backends, einer Upload-/OCR-Funktion oder einer
        Reichweitenmessung).
      </p>

      <section {...contactProps}>
        <h2>1. Verantwortlicher</h2>
        <address>
          Peter Hartwieg<br />
          Tölzer Str. 5a<br />
          81379 München<br />
          Deutschland<br />
          E-Mail:{' '}
          <a href="mailto:peter@hartwieg.com">peter@hartwieg.com</a>
        </address>
      </section>

      <section {...bodyProps}>
        <h2>2. Grundsatz: keine Erhebung personenbezogener Daten</h2>
        <p>
          Diese Anwendung ist ein <strong>rein clientseitig laufender
          Rechner</strong>. Sämtliche Berechnungen finden ausschließlich im
          Browser des Nutzers statt. Es werden{' '}
          <strong>keine personenbezogenen Daten</strong> an den Anbieter
          übertragen, gespeichert oder ausgewertet. Es gibt:
        </p>
        <ul>
          <li>kein Nutzerkonto, keine Registrierung, keine Anmeldung;</li>
          <li>keine serverseitige Datenbank für Eingabe- oder Ergebnisdaten;</li>
          <li>kein Tracking, keine Reichweitenmessung, keine Cookies zu
            Analyse- oder Werbezwecken;</li>
          <li>keine Einbindung von Drittanbieter-Skripten (Google Fonts,
            Analytics, Werbenetzwerke, Social Plugins).</li>
        </ul>
      </section>

      <section>
        <h2>3. Bereitstellung der Anwendung &amp; Server-Logfiles</h2>
        <p>
          Beim Aufruf der Webseite werden technische Verbindungsdaten an den
          Hosting-Provider übertragen, die für die Auslieferung der Anwendung
          notwendig sind. Welche Daten der Hosting-Provider in Server-Logs
          speichert, hängt vom konkret eingesetzten Anbieter ab; übliche
          Felder sind IP-Adresse, Datum/Uhrzeit, übertragene Datenmenge,
          aufgerufene URL, Referrer und User-Agent. Diese Daten werden
          ausschließlich zur Bereitstellung und Sicherheit des Dienstes
          verarbeitet.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
          Interesse an einem stabilen, sicheren Betrieb).
        </p>
        <p>
          Hosting-Provider: <strong>Cloudflare, Inc.</strong>, 101 Townsend
          St., San Francisco, CA 94107, USA (Auftragsverarbeiter). Die
          Anwendung wird über Cloudflare Workers ausgeliefert. Cloudflare
          erfasst dabei serverseitige Zugriffsprotokolle (u.&nbsp;a.
          IP-Adresse, Zeitstempel, aufgerufener Pfad, User-Agent, Referrer)
          im Rahmen der standardmäßigen Protokollaufbewahrung von Cloudflare.
          Deutsche Nutzerinnen und Nutzer werden typischerweise von
          EU-Standorten (Points of Presence) bedient. Weitere Informationen
          zur Datenverarbeitung durch Cloudflare finden Sie in der{' '}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutzerklärung von Cloudflare
          </a>
          .
        </p>
      </section>

      <section {...storagePolicyProps}>
        <h2>4. Lokale Speicherung im Browser</h2>
        <p>
          Die Anwendung speichert Eingaben (Profil, Annahmen, gespeicherte
          Szenarien, Disclaimer-Status) ausschließlich im{' '}
          <strong>localStorage</strong> bzw.{' '}
          <strong>sessionStorage</strong> Ihres Browsers. Diese Daten
          verlassen Ihr Gerät nicht und werden nicht an den Anbieter oder
          Dritte übertragen. Sie können jederzeit über die Datenschutz- bzw.
          Verlaufsfunktion Ihres Browsers gelöscht werden; die Anwendung
          startet anschließend wieder mit den Standardannahmen.
        </p>
        <p>
          Konkret werden folgende Schlüssel verwendet:
        </p>
        <ul>
          <li>
            <code>{STORAGE_KEY_V1}</code> — aktuelles Profil und Annahmen,
            Schema v1 (localStorage);
          </li>
          <li>
            <code>{STORAGE_KEY_V2}</code> — Workspace-Zustand mit
            Produkt-Instanzen, Schema v2 (localStorage);
          </li>
          <li>
            <code>{LIBRARY_KEY}</code> — vom Nutzer gespeicherte
            Szenarien (localStorage);
          </li>
          <li>
            <code>{LEGACY_SETUP_FLAG_KEY}</code> — Altdatenfeld aus einer
            früheren Version (Status des geführten Einstiegs); wird nicht
            mehr geschrieben, kann aber bei wiederkehrenden Nutzer&shy;innen
            noch im Browser stehen.
          </li>
          <li>
            <code>{WORKSPACE_KEY}</code> — zuletzt aktive Workspace-Ansicht
            (localStorage);
          </li>
          <li>
            <code>{DISMISS_KEY}</code> — sitzungsweises Ausblenden des
            Hinweisbanners (sessionStorage; wird beim Schließen des Browsers
            gelöscht);
          </li>
        </ul>
        <p>
          Diese Speicherung ist technisch erforderlich, um die vom Nutzer
          eingegebenen Werte über einen Seitenwechsel hinweg zu erhalten,
          und beruht auf § 25 Abs. 2 Nr. 2 TDDDG / TTDSG (unbedingt
          erforderliche lokale Speicherung). Eine Einwilligung ist daher
          nicht erforderlich.
        </p>
      </section>

      <section>
        <h2>5. Teilen-Funktion (Share-URL)</h2>
        <p>
          Die Anwendung bietet eine "Link kopieren"-Funktion an. Beim
          Anklicken werden die aktuellen Eingaben in die URL kodiert und in
          die Zwischenablage des Geräts kopiert. Es findet keine Übertragung
          dieser Daten an den Anbieter oder Dritte statt. Wenn Sie diesen Link
          aktiv weitergeben, sind Sie selbst verantwortlich für die in der
          URL enthaltenen Werte. Empfehlung: keine sensiblen Echtdaten
          weitergeben.
        </p>
      </section>

      <section>
        <h2>6. Exporte (CSV, PDF)</h2>
        <p>
          Die "CSV exportieren"- und "PDF drucken"-Funktionen erzeugen Dateien
          ausschließlich auf Ihrem Gerät. Es werden keine Daten an den
          Anbieter, an einen Server oder an Dritte übertragen.
        </p>
      </section>

      <section>
        <h2>7. Rechte der betroffenen Person</h2>
        <p>
          Soweit überhaupt personenbezogene Daten verarbeitet werden (siehe
          Abschnitt 3), haben Sie nach DSGVO insbesondere das Recht auf:
        </p>
        <ul>
          <li>Auskunft (Art. 15 DSGVO);</li>
          <li>Berichtigung (Art. 16 DSGVO);</li>
          <li>Löschung (Art. 17 DSGVO);</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO);</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO);</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO);</li>
          <li>
            Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO).
            Zuständige Aufsichtsbehörde ist das Bayerische Landesamt für
            Datenschutzaufsicht, Promenade 18, 91522 Ansbach.
          </li>
        </ul>
        <p>
          Anfragen können formlos an{' '}
          <a href="mailto:peter@hartwieg.com">peter@hartwieg.com</a> gerichtet
          werden.
        </p>
      </section>

      <section>
        <h2>8. Änderungen dieser Erklärung</h2>
        <p>
          Diese Datenschutzerklärung wird angepasst, sobald sich die
          Verarbeitung personenbezogener Daten ändert. Geplant sind
          insbesondere folgende Erweiterungen, die jeweils im Vorfeld in
          dieser Erklärung dokumentiert werden:
        </p>
        <ul>
          <li>
            <strong>Reichweitenmessung:</strong> Falls eingeführt, ausschließlich
            cookiefrei und mit EU-Hosting (z.&nbsp;B. Plausible / Umami);
          </li>
          <li>
            <strong>Document-Upload / OCR:</strong> Falls eingeführt, mit
            kurzlebiger, automatisch gelöschter Verarbeitung; keine
            dauerhafte Speicherung der hochgeladenen Dokumente;
          </li>
          <li>
            <strong>Kontaktformular für Lizenzanfragen:</strong> Falls eingeführt,
            mit klarer Zweckbindung (Bearbeitung der Anfrage) und Angabe der
            Speicherdauer.
          </li>
        </ul>
      </section>

      <section id="qa-feedback">
        <h2>9. QA-Feedback-Modus</h2>
        <p>
          Die Anwendung enthält einen optionalen QA-Feedback-Modus (erreichbar
          über <code>?qa=1</code> in der URL), der ausgewählten Testerinnen und
          Testern erlaubt, Rückmeldungen und Screenshots direkt an die
          Entwickler zu senden, ohne ein GitHub-Konto zu benötigen. Dieser
          Modus ist für die breite Öffentlichkeit nicht vorgesehen und nur über
          einen expliziten URL-Parameter aktivierbar. Beim Aufruf des
          Feedback-Formulars werden folgende Datenflüsse ausgelöst:
        </p>

        <h3>a) Cloudflare Turnstile</h3>
        <p>
          Zur Spam-Abwehr wird das Widget <strong>Cloudflare Turnstile</strong>{' '}
          eingebunden. Es wird ein Skript von{' '}
          <code>challenges.cloudflare.com</code> geladen, sobald die
          Vorschauansicht des Feedback-Formulars geöffnet wird. Dabei werden
          technische Signale (IP-Adresse, User-Agent, Browserverhalten) an
          Cloudflare Inc. (USA) übertragen.
        </p>
        <p>
          Drittanbieter: Cloudflare Inc., 101 Townsend St, San Francisco, CA
          94107, USA.{' '}
          <a
            href="https://www.cloudflare.com/de-de/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutzerklärung von Cloudflare
          </a>
          . Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
          an der Abwehr von Spam und Missbrauch).
        </p>

        <h3>b) QA-Feedback-Worker</h3>
        <p>
          Nach Bestätigung des Turnstile-Widgets wird das Feedback (Kommentartext,
          technische Umgebungsdaten wie Route, Viewport und Browser-Familie sowie
          optional ein Screenshot) an den Endpunkt{' '}
          <code>https://qa.rentenwiki.de/submit</code> übertragen. Dieser
          Cloudflare Worker erstellt auf Basis der übermittelten Daten ein{' '}
          <strong>öffentliches GitHub-Issue</strong> im Repository{' '}
          <code>PeterHartwieg/Rentenrechner</code>.
        </p>
        <p>
          Das Issue ist öffentlich einsehbar und enthält den Kommentartext sowie
          die technischen Umgebungsdaten. Falls ein Screenshot hochgeladen wurde,
          enthält das Issue einen Link zur gespeicherten Bilddatei (siehe
          Abschnitt c). Eine Zuordnung zum Gerät oder zur Person ist nur möglich,
          wenn der Kommentartext personenbezogene Angaben enthält; solche Angaben
          sollten daher vermieden werden.
        </p>
        <p>
          Drittanbieter: GitHub Inc. (Microsoft Corporation), 88 Colin P. Kelly
          Jr. St, San Francisco, CA 94107, USA.{' '}
          <a
            href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement"
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutzerklärung von GitHub
          </a>
          . Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
          an der Qualitätssicherung des Dienstes).
        </p>

        <h3>c) R2-Screenshot-Bucket</h3>
        <p>
          Wenn beim Absenden des Feedbacks ein Screenshot beigefügt wird,
          speichert der QA-Worker diesen in einem{' '}
          <strong>Cloudflare R2</strong>-Objektspeicher unter dem Namen{' '}
          <code>rentenwiki-qa-screenshots</code>. Die Region des Buckets ist
          derzeit nicht explizit festgelegt (siehe ADR-0001); Cloudflare R2
          wählt in diesem Fall automatisch eine Region.
        </p>
        <p>
          <strong>Aufbewahrungsdauer:</strong> Screenshots werden an die
          Lebensdauer des zugehörigen GitHub-Issues gekoppelt. Sobald das Issue
          geschlossen wird, löscht ein GitHub-Webhook-Handler die Bilddatei
          automatisch aus dem R2-Bucket. Eine darüber hinausgehende Speicherung
          findet nicht statt.
        </p>
        <p>
          Drittanbieter: Cloudflare Inc., 101 Townsend St, San Francisco, CA
          94107, USA.{' '}
          <a
            href="https://www.cloudflare.com/de-de/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutzerklärung von Cloudflare
          </a>
          . Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
        </p>
      </section>
    </LegalLayout>
  )
}
