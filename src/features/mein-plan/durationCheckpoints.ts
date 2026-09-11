import type { DurationDescriptor } from '../../app/planSummary'

/** Ages the checkpoint table always shows, on top of the retirement age. */
export const DURATION_CHECKPOINT_AGES: readonly number[] = [80, 90, 95, 100]

/** Whether a source is still paying at `age`. A finite payout has ended once its end age is reached. */
export function isPayingAt(duration: DurationDescriptor, age: number): boolean {
  if (duration.kind === 'lifelong') return true
  return age < duration.endAge
}

/** Checkpoint ages in order: retirement age first (when known), then the fixed set above it. */
export function checkpointAges(retirementAge: number | undefined): number[] {
  const ages = new Set<number>()
  if (retirementAge !== undefined) ages.add(retirementAge)
  for (const age of DURATION_CHECKPOINT_AGES) {
    if (retirementAge === undefined || age > retirementAge) ages.add(age)
  }
  return [...ages].sort((a, b) => a - b)
}
