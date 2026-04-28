import '../../ui/forms.css'
import '../../ui/fees.css'
import './InsuranceInputs.css'
import type React from 'react'
import type {
  GermanRules,
  InsuranceTaxMode,
  PayoutMode,
  PersonalProfile,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain/types';
import { NumberField } from '../../ui/NumberField';
import { formatCurrency, formatPercent } from '../../utils/format';
import { PAV_FEE_PRESETS } from '../../app/productPresentation';

type Props = {
  assumptions: ScenarioAssumptions;
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>;
  profile: PersonalProfile;
  insuranceTaxMode: InsuranceTaxMode;
  insuranceProductResult: ProductResult | undefined;
  rules: GermanRules;
};

export function InsuranceInputs({
  assumptions,
  onAssumptionsChange,
  profile,
  insuranceTaxMode,
  insuranceProductResult,
}: Props) {
  const ins = assumptions.insurance;

  return (
    <>
      <NumberField
        label="Vertragsjahr (pAV)"
        value={ins.contractStartYear}
        min={1970}
        max={2030}
        step={1}
        onChange={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            insurance: { ...current.insurance, contractStartYear: Number(value) },
          }))
        }
      />
      <small className="field-hint">
        {insuranceTaxMode === 'pre2005' && (
          <>Vor 2005: steuerfrei · §52 Abs. 28 EStG a.F.</>
        )}
        {insuranceTaxMode === 'halbeinkuenfte' && (
          <>Halbeinkünfteverfahren: ½ des Ertrags mit persönl. Steuersatz · §20 Abs. 1 Nr. 6 EStG · (≥ 12 Jahre Laufzeit, Auszahlung ab 62)</>
        )}
        {insuranceTaxMode === 'abgeltungsteuer' && (
          <>Abgeltungsteuer: voller Ertrag mit 25 % + Soli · §20 Abs. 2 EStG</>
        )}
      </small>

      {ins.contractStartYear < 2005 && (
        <>
          <label className="field field-inline">
            <input
              type="checkbox"
              checked={ins.oldContractTaxFreeEligible}
              onChange={(event) =>
                onAssumptionsChange((current) => ({
                  ...current,
                  insurance: {
                    ...current.insurance,
                    oldContractTaxFreeEligible: event.target.checked,
                  },
                }))
              }
            />
            <span>Altvertrag steuerfrei nach §52 Abs. 28 EStG a.F. (mind. 12 Jahre Laufzeit, mind. 5 Beitragsjahre)</span>
          </label>
          {ins.contractStartYear < 2005 && !ins.oldContractTaxFreeEligible && (
            <p className="field-hint">
              Steuerfreiheit abgewählt — es gelten die Post-2004-Regeln (Halbeinkünfteverfahren oder Abgeltungsteuer).
            </p>
          )}
        </>
      )}

      {insuranceTaxMode === 'halbeinkuenfte' && (
        <>
          <NumberField
            label="Sonst. Renteneinkommen (pAV)"
            value={ins.monthlyOtherRetirementIncome}
            min={0}
            step={50}
            suffix="EUR mtl."
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                insurance: { ...current.insurance, monthlyOtherRetirementIncome: Number(value) },
              }))
            }
          />
          {ins.monthlyOtherRetirementIncome > 0 && (
            <p className="field-hint">
              Steuer(½ Ertrag + {formatCurrency(ins.monthlyOtherRetirementIncome, 0)}/Monat) −
              Steuer({formatCurrency(ins.monthlyOtherRetirementIncome, 0)}/Monat).
            </p>
          )}
        </>
      )}

      <label className="field">
        <span>Auszahlungsform (pAV)</span>
        <select
          value={ins.payoutMode}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: { ...current.insurance, payoutMode: event.target.value as PayoutMode },
            }))
          }
        >
          <option value="leibrente">Leibrente (Rentenfaktor)</option>
          <option value="zeitrente">Zeitrente (fester Auszahlungszeitraum)</option>
          <option value="kapitalverzehr">Kapitalverzehr (selbstgesteuerte Entnahme)</option>
        </select>
        <small className="field-hint">
          {ins.payoutMode === 'leibrente' && (
            <>Lebenslange Rente nach Vertrags-Rentenfaktor; Kapitalverzehr-Endalter wird ignoriert.</>
          )}
          {ins.payoutMode === 'zeitrente' && (
            <>Vertraglich befristete Rente über die unten gewählte Anzahl Jahre.</>
          )}
          {ins.payoutMode === 'kapitalverzehr' && (
            <>Eigenverwaltete Entnahme bis zum globalen Endalter (Annuitätenformel).</>
          )}
        </small>
      </label>

      {ins.payoutMode === 'leibrente' && (
        <NumberField
          label="Rentenfaktor (pAV)"
          value={ins.rentenfaktor}
          min={1}
          max={80}
          step={0.5}
          suffix="EUR/10k mtl."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: { ...current.insurance, rentenfaktor: Number(value) },
            }))
          }
        />
      )}

      {ins.payoutMode === 'zeitrente' && (
        <NumberField
          label="Zeitrente-Dauer (pAV)"
          value={ins.zeitrenteYears}
          min={1}
          max={50}
          step={1}
          suffix="Jahre"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: { ...current.insurance, zeitrenteYears: Number(value) },
            }))
          }
        />
      )}

      <div className="subsection-heading">
        <h3>Beitragsfreistellung / Kündigung (pAV)</h3>
        <p>Modelliert das vorzeitige Ende der Beitragszahlung. Das Kapital wächst danach unter laufenden Kosten weiter bis zum Rentenbeginn. Die Kündigung ermittelt den geschätzten Rückkaufswert zum gewählten Alter.</p>
      </div>

      <label className="field field-inline">
        <input
          type="checkbox"
          checked={ins.paidUpAge !== undefined}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                paidUpAge: event.target.checked
                  ? Math.max(profile.age + 1, Math.min(profile.retirementAge - 1, profile.age + Math.floor((profile.retirementAge - profile.age) / 2)))
                  : undefined,
              },
            }))
          }
        />
        <span>Beitragsfreistellung / Kündigung modellieren</span>
      </label>

      {ins.paidUpAge !== undefined && (
        <>
          <NumberField
            label="Beitragsfrei ab Alter"
            value={ins.paidUpAge}
            min={profile.age + 1}
            max={profile.retirementAge - 1}
            step={1}
            suffix="Jahre"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                insurance: {
                  ...current.insurance,
                  paidUpAge: Math.max(profile.age + 1, Math.min(profile.retirementAge - 1, Number(value))),
                },
              }))
            }
          />
          <NumberField
            label="Stornoabschlag (Kündigung)"
            value={ins.surrenderHaircutPct * 100}
            min={0}
            max={50}
            step={0.5}
            suffix="%"
            onChange={(value) =>
              onAssumptionsChange((current) => ({
                ...current,
                insurance: {
                  ...current.insurance,
                  surrenderHaircutPct: Number(value) / 100,
                },
              }))
            }
          />
          <small className="field-hint">
            Rückkaufswert = Kapital bei Beitragsfreistellung × (1 − Stornoabschlag). Nach Beitragsfreistellung wachsen noch Mantel- und Fondsgebühren; keine Beitrags-, Fixkosten oder Abschlussgebühren mehr.
          </small>
        </>
      )}

      {(() => {
        const pu = insuranceProductResult?.paidUpScenario;
        if (!pu) return null;
        return (
          <div className="paid-up-summary">
            <h4>Beitragsfreistellung ab Alter {pu.paidUpAge}</h4>
            <table className="paid-up-table">
              <tbody>
                <tr>
                  <td>Kapital bei Beitragsfreistellung</td>
                  <td className="num">{formatCurrency(pu.capitalAtPaidUp, 0)}</td>
                </tr>
                <tr>
                  <td>Rückkaufswert (Kündigung jetzt)</td>
                  <td className="num">{formatCurrency(pu.surrenderValue, 0)}</td>
                </tr>
                <tr>
                  <td>Kosten bis Alter {pu.paidUpAge}</td>
                  <td className="num">{formatCurrency(pu.feesAtPaidUp, 0)}</td>
                </tr>
                <tr className="paid-up-separator">
                  <td colSpan={2}>Weiterlaufendes Kapital bis Rentenbeginn (beitragsfrei)</td>
                </tr>
                <tr>
                  <td>Kapital bei Rentenbeginn (beitragsfrei)</td>
                  <td className="num">{formatCurrency(pu.retirementCapital, 0)}</td>
                </tr>
                <tr>
                  <td>Brutto-Rente (beitragsfrei)</td>
                  <td className="num">{formatCurrency(pu.grossMonthlyPayout, 0)} / Monat</td>
                </tr>
                <tr>
                  <td>Netto-Rente (beitragsfrei)</td>
                  <td className="num">{formatCurrency(pu.netMonthlyPayout, 0)} / Monat</td>
                </tr>
                {pu.afterTaxLumpSum !== null && (
                  <tr>
                    <td>Kapitalwahl nach Steuer (beitragsfrei)</td>
                    <td className="num">{formatCurrency(pu.afterTaxLumpSum, 0)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      <div className="subsection-heading">
        <h3>pAV-Kosten (Schicht 3)</h3>
        <p>Private Rentenversicherung (Schicht 3) — gleiche Kostenlogik wie bAV, separat konfigurierbar. Vorlagen setzen alle Felder. Basisrente (Schicht 1) und Riester (Schicht 2) sind in diesem Produkt nicht abgebildet.</p>
      </div>

      <div className="fee-presets">
        {PAV_FEE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="preset-btn"
            onClick={() =>
              onAssumptionsChange((current) => ({
                ...current,
                insurance: { ...current.insurance, fees: preset.fees },
              }))
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="field-grid">
        <NumberField
          label="Fixkosten je Monat"
          value={ins.fees.fixedMonthlyFee}
          min={0}
          max={50}
          step={0.5}
          suffix="EUR"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: { ...current.insurance.fees, fixedMonthlyFee: Number(value) },
              },
            }))
          }
        />
        <NumberField
          label="Kosten je Beitrag"
          value={ins.fees.contributionFee * 100}
          min={0}
          max={20}
          step={0.25}
          suffix="%"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: { ...current.insurance.fees, contributionFee: Number(value) / 100 },
              },
            }))
          }
        />
        <NumberField
          label="Versicherungsmantel"
          value={ins.fees.wrapperAssetFee * 100}
          min={0}
          max={3}
          step={0.05}
          suffix="% p.a."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: { ...current.insurance.fees, wrapperAssetFee: Number(value) / 100 },
              },
            }))
          }
        />
        <NumberField
          label="Fonds-/ETF-Kosten"
          value={ins.fees.fundAssetFee * 100}
          min={0}
          max={3}
          step={0.05}
          suffix="% p.a."
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: { ...current.insurance.fees, fundAssetFee: Number(value) / 100 },
              },
            }))
          }
        />
        <NumberField
          label="Rentengebühr"
          value={ins.fees.pensionPayoutFeePct * 100}
          min={0}
          max={5}
          step={0.05}
          suffix="% je Rente"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: { ...current.insurance.fees, pensionPayoutFeePct: Number(value) / 100 },
              },
            }))
          }
        />
        <NumberField
          label="Abschlusskosten"
          value={ins.fees.acquisitionCostPct * 100}
          min={0}
          max={8}
          step={0.25}
          suffix="% Summe"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: { ...current.insurance.fees, acquisitionCostPct: Number(value) / 100 },
              },
            }))
          }
        />
        <NumberField
          label="Verteilung Abschlusskosten"
          value={ins.fees.acquisitionCostSpreadYears}
          min={1}
          max={15}
          step={1}
          suffix="Jahre"
          onChange={(value) =>
            onAssumptionsChange((current) => ({
              ...current,
              insurance: {
                ...current.insurance,
                fees: {
                  ...current.insurance.fees,
                  acquisitionCostSpreadYears: Number(value),
                },
              },
            }))
          }
        />
      </div>

      {(() => {
        const f = ins.fees;
        const totalAsset = f.wrapperAssetFee + f.fundAssetFee;
        const riy = insuranceProductResult?.accumulationRiy ?? 0;
        return (
          <div className="fee-summary">
            <span>
              Gesamt Kapitalgebühr: <strong>{formatPercent(totalAsset)}</strong> p.a.
              (Mantel {formatPercent(f.wrapperAssetFee)} + Fonds {formatPercent(f.fundAssetFee)})
            </span>
            <span className={riy > 0.02 ? 'riy-high' : riy > 0.015 ? 'riy-warn' : ''}>
              Effektivkosten: <strong>{formatPercent(riy)}</strong>
            </span>
            {f.contributionFee > 0.05 && (
              <p className="field-warning">Beitragskostenquote {formatPercent(f.contributionFee)} liegt über 5 % — typische Nettotarife erheben keine Kosten je Beitrag.</p>
            )}
            {f.acquisitionCostPct > 0.025 && (
              <p className="field-warning">Abschlusskosten {formatPercent(f.acquisitionCostPct)} übersteigen 2,5 % der Beitragssumme.</p>
            )}
            {totalAsset > 0.01 && (
              <p className="field-warning">Laufende Kapitalgebühr {formatPercent(totalAsset)} p.a. liegt über 1,0 % — prüfen Sie ETF-basierte Nettotarife (typisch 0,5–0,8 % all-in).</p>
            )}
            {riy > 0.02 && (
              <p className="field-warning">Effektivkosten {formatPercent(riy)} überschreiten 2,0 % — ETF-basierte Verträge über dieser Schwelle gelten i. d. R. als unwirtschaftlich.</p>
            )}
            {riy > 0.015 && riy <= 0.02 && (
              <p className="field-warning">Effektivkosten {formatPercent(riy)} liegen im kritischen Bereich (1,5–2,0 %) — Nettotarife erzielen typisch 0,6–1,0 %.</p>
            )}
          </div>
        );
      })()}
    </>
  );
}
