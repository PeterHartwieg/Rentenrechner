import { useFeedbackTarget } from '../features/qa-feedback'

export function ResultMetric({
  label,
  value,
  detail,
  feedbackTargetId,
}: {
  label: string
  value: string
  detail?: string
  /**
   * QA-feedback target id. When set, the wrapping `<div>` carries a
   * `data-qa-target` attribute so QA mode can pin this metric as a feedback
   * subject. Inert when QA mode is disabled.
   * Convention: `results.<area>.<metric>`
   */
  feedbackTargetId?: string
}) {
  const { targetProps } = useFeedbackTarget({
    id: feedbackTargetId ?? '',
    label,
    precision: 'exact',
  })
  const qaProps = feedbackTargetId ? targetProps : {}
  return (
    <div className="metric" {...qaProps}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}
