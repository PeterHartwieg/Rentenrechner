import './BavWaterfall.css'
import type { BavFundingResult } from '../domain'
import { formatCurrency } from '../utils/format'

export function BavWaterfall({ f }: { f: BavFundingResult }) {
  const monthlyTaxSavings =
    (f.salaryWithoutBav.incomeTax + f.salaryWithoutBav.solidarityTax -
      f.salaryWithBav.incomeTax - f.salaryWithBav.solidarityTax) / 12
  const monthlySvSavings = (f.salaryWithoutBav.social.total - f.salaryWithBav.social.total) / 12

  return (
    <div className="bav-waterfall">
      <h3>bAV-Förderung im Überblick</h3>
      <dl>
        <div className="wf-row wf-base">
          <dt>Bruttoumwandlung</dt>
          <dd>{formatCurrency(f.monthlyGrossConversion, 0)}</dd>
        </div>
        <div className="wf-row wf-minus">
          <dt>− Steuerersparnis</dt>
          <dd>{formatCurrency(monthlyTaxSavings, 0)}</dd>
        </div>
        <div className="wf-row wf-minus">
          <dt>− SV-Ersparnis</dt>
          <dd>{formatCurrency(monthlySvSavings, 0)}</dd>
        </div>
        <div className="wf-row wf-result">
          <dt>= Nettoaufwand AN</dt>
          <dd>{formatCurrency(f.monthlyNetCost, 0)}</dd>
        </div>
        <div className="wf-row wf-plus">
          <dt>+ AG-Zuschuss</dt>
          <dd>{formatCurrency(f.monthlyEmployerContribution, 0)}</dd>
        </div>
        <div className="wf-row wf-total">
          <dt>= Monatl. Beitrag</dt>
          <dd>{formatCurrency(f.monthlyGrossConversion + f.monthlyEmployerContribution, 0)}</dd>
        </div>
      </dl>
    </div>
  )
}
