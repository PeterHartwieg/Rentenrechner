import './AssumptionsPanel.css'
import type { GermanRules } from '../../domain';
import { formatCurrency, formatPercent } from '../../utils/format';

interface AssumptionsPanelProps {
  show: boolean;
  onToggle: () => void;
  rules: GermanRules;
  bavMinAnnual: number;
  bavMinMonthly: number;
}

export function AssumptionsPanel({
  show,
  onToggle,
  rules,
  bavMinAnnual,
  bavMinMonthly,
}: AssumptionsPanelProps) {
  return (
    <section className="assumptions-section">
      <button
        type="button"
        className="assumptions-toggle"
        onClick={onToggle}
        aria-expanded={show}
      >
        Regelwerte & Quellen 2026 {show ? '▲' : '▼'}
      </button>
      {show && (
        <div className="assumptions-content">
          <div className="assumptions-group">
            <h3>Einkommensteuer 2026</h3>
            <dl>
              <div><dt>Grundfreibetrag</dt><dd>{formatCurrency(rules.incomeTax.basicAllowance, 0)} EUR · <a href="https://www.gesetze-im-internet.de/estg/__32a.html" target="_blank" rel="noreferrer">EStG §32a</a></dd></div>
              <div><dt>Progressionszone 1 bis</dt><dd>{formatCurrency(rules.incomeTax.firstProgressionEnd, 0)} EUR</dd></div>
              <div><dt>Progressionszone 2 bis</dt><dd>{formatCurrency(rules.incomeTax.secondProgressionEnd, 0)} EUR</dd></div>
              <div><dt>Spitzensteuersatz ab</dt><dd>{formatCurrency(rules.incomeTax.topTaxStart, 0)} EUR</dd></div>
              <div><dt>Soli-Freigrenze (Einkommensteuer)</dt><dd>{formatCurrency(rules.incomeTax.solidarityFreeTax, 0)} EUR</dd></div>
              <div><dt>Arbeitnehmer-Pauschbetrag</dt><dd>{formatCurrency(rules.employeeAllowance, 0)} EUR · <a href="https://www.gesetze-im-internet.de/estg/__9a.html" target="_blank" rel="noreferrer">EStG §9a</a></dd></div>
              <div><dt>Sonderausgaben-Pauschbetrag</dt><dd>{formatCurrency(rules.specialExpensesAllowance, 0)} EUR · <a href="https://www.gesetze-im-internet.de/estg/__10c.html" target="_blank" rel="noreferrer">EStG §10c</a></dd></div>
            </dl>
          </div>

          <div className="assumptions-group">
            <h3>Sozialversicherung 2026</h3>
            <dl>
              <div><dt>BBG Rente/AV</dt><dd>{formatCurrency(rules.socialSecurity.pensionCapYear, 0)} EUR/Jahr · <a href="https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514" target="_blank" rel="noreferrer">Bundesregierung</a></dd></div>
              <div><dt>BBG KV/PV</dt><dd>{formatCurrency(rules.socialSecurity.healthCareCapYear, 0)} EUR/Jahr</dd></div>
              <div><dt>RV Arbeitnehmer/Arbeitgeber</dt><dd>{formatPercent(rules.socialSecurity.pensionEmployeeRate)} / {formatPercent(rules.socialSecurity.pensionEmployerRate)} · <a href="https://www.gesetze-im-internet.de/sgb_6/__158.html" target="_blank" rel="noreferrer">SGB VI §158</a></dd></div>
              <div><dt>AV Arbeitnehmer/Arbeitgeber</dt><dd>{formatPercent(rules.socialSecurity.unemploymentEmployeeRate)} / {formatPercent(rules.socialSecurity.unemploymentEmployerRate)}</dd></div>
              <div><dt>GKV allgemeiner Beitragssatz</dt><dd>{formatPercent(rules.socialSecurity.healthGeneralRate)} · <a href="https://www.gesetze-im-internet.de/sgb_5/__241.html" target="_blank" rel="noreferrer">SGB V §241</a></dd></div>
              <div><dt>GKV ermäßigter Satz (VPS-Grundlage)</dt><dd>{formatPercent(rules.socialSecurity.healthReducedRate)} · <a href="https://www.gesetze-im-internet.de/sgb_5/__243.html" target="_blank" rel="noreferrer">SGB V §243</a></dd></div>
              <div><dt>PV AN (kinderlos)</dt><dd>{formatPercent(rules.socialSecurity.careEmployeeChildlessRate)} · <a href="https://www.gesetze-im-internet.de/sgb_11/__55.html" target="_blank" rel="noreferrer">SGB XI §55</a></dd></div>
              <div><dt>PV AN (Grundsatz)</dt><dd>{formatPercent(rules.socialSecurity.careEmployeeBaseRate)}</dd></div>
              <div><dt>PV Arbeitgeber</dt><dd>{formatPercent(rules.socialSecurity.careEmployerRate)}</dd></div>
              <div><dt>PV Altersrentner (kinderlos)</dt><dd>{formatPercent(rules.socialSecurity.careRetirementChildlessRate)} · <a href="https://www.gesetze-im-internet.de/sgb_11/__57.html" target="_blank" rel="noreferrer">SGB XI §57</a></dd></div>
              <div><dt>KV-Freibetrag Versorgungsbezüge</dt><dd>{formatCurrency(rules.socialSecurity.kvFreibetragVersorgungMonthly, 2)} EUR/Monat · <a href="https://www.gesetze-im-internet.de/sgb_5/__226.html" target="_blank" rel="noreferrer">SGB V §226(2)</a></dd></div>
              <div><dt>Bezugsgröße West</dt><dd>{formatCurrency(rules.socialSecurity.bezugsgroesseMonthly, 0)} EUR/Monat · <a href="https://www.gesetze-im-internet.de/sgb_4/__18.html" target="_blank" rel="noreferrer">SGB IV §18</a></dd></div>
            </dl>
          </div>

          <div className="assumptions-group">
            <h3>bAV-Grenzen 2026</h3>
            <dl>
              <div><dt>Steuerfreie Grenze (8 % BBG)</dt><dd>{formatCurrency(rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap, 0)} EUR/Jahr · <a href="https://www.gesetze-im-internet.de/estg/__3.html" target="_blank" rel="noreferrer">EStG §3 Nr. 63</a></dd></div>
              <div><dt>SV-freie Grenze (4 % BBG)</dt><dd>{formatCurrency(rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap, 0)} EUR/Jahr · SvEV §1</dd></div>
              <div><dt>Pflicht-AG-Zuschuss</dt><dd>{formatPercent(rules.bav.statutoryEmployerSubsidyPct)} (begrenzt auf AG-SV-Ersparnis) · <a href="https://www.gesetze-im-internet.de/betravg/__1a.html" target="_blank" rel="noreferrer">BetrAVG §1a</a></dd></div>
              <div><dt>Mindest-Entgeltumwandlung (§1a-Anspruch)</dt><dd>{formatCurrency(bavMinAnnual, 2)} EUR/Jahr · {formatCurrency(bavMinMonthly, 2)} EUR/Monat</dd></div>
            </dl>
          </div>

          <div className="assumptions-group">
            <h3>Kapitalertragsteuer 2026</h3>
            <dl>
              <div><dt>Abgeltungsteuer</dt><dd>{formatPercent(rules.capitalGains.taxRate)} · <a href="https://www.gesetze-im-internet.de/estg/__32d.html" target="_blank" rel="noreferrer">EStG §32d</a></dd></div>
              <div><dt>Solidaritätszuschlag</dt><dd>{formatPercent(rules.capitalGains.solidarityRate)}</dd></div>
              <div><dt>Sparerpauschbetrag</dt><dd>{formatCurrency(rules.capitalGains.saverAllowance, 0)} EUR/Jahr · <a href="https://www.gesetze-im-internet.de/estg/__20.html" target="_blank" rel="noreferrer">EStG §20 Abs. 9</a></dd></div>
              <div><dt>Basiszins 2026 (Vorabpauschale)</dt><dd>{formatPercent(rules.capitalGains.basiszins)} · <a href="https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html" target="_blank" rel="noreferrer">BMF 2026-01-13</a> · <a href="https://www.gesetze-im-internet.de/invstg_2018/__18.html" target="_blank" rel="noreferrer">InvStG §18</a></dd></div>
            </dl>
          </div>

          <div className="assumptions-group">
            <h3>Gesetzliche Rente (Schätzwerte für #5)</h3>
            <dl>
              <div><dt>Vorläufiges Durchschnittsentgelt 2026</dt><dd>{formatCurrency(rules.socialSecurity.durchschnittsentgelt, 0)} EUR · SGB VI Anlage 1</dd></div>
              <div><dt>Aktueller Rentenwert West</dt><dd>{formatCurrency(rules.socialSecurity.aktuellerRentenwert, 2)} EUR/EP (ab 1.7.2025, 2026-Anpassung ausstehend)</dd></div>
              <div><dt>Zugangsfaktor / Rentenartfaktor</dt><dd>1,0 / 1,0 (vereinfacht: Regelaltersrente ohne Abschläge)</dd></div>
            </dl>
            <p className="assumptions-note">
              Diese Schätzwerte dienen nur zur Abschätzung der GRV-Minderung durch Entgeltumwandlung.
              Die tatsächliche Rente hängt von der vollständigen Erwerbsbiografie ab.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
