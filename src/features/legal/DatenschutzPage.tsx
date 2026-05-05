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
          <em>Hinweis:</em> Sobald ein konkreter Hosting-Provider gewählt
          ist, wird hier dessen Name, Sitz, Speicherdauer und der Link zu
          dessen eigener Datenschutzerklärung ergänzt. Bis dahin gilt: vor
          öffentlichem Launch wird diese Information ergänzt.
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
            <strong>Hosting-Provider:</strong> Ergänzung von Anbieter, Sitz,
            Speicherdauer der Server-Logs sobald die Anwendung öffentlich
            ausgeliefert wird;
          </li>
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
    </LegalLayout>
  )
}
