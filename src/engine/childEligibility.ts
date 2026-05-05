/**
 * Shared child-year predicates for contribution-year calculations.
 *
 * Future/planned children are dated events: they only affect a calculation once
 * the modeled contribution year reaches their birth year. Child allowances and
 * Pflege discounts also use the under-25 window in the relevant year.
 */

export function childBirthYearsBornByYear(
  childBirthYears: readonly number[],
  contributionYear: number,
): number[] {
  return childBirthYears.filter((year) => year <= contributionYear)
}

export function childBirthYearsUnder25InYear(
  childBirthYears: readonly number[],
  contributionYear: number,
): number[] {
  return childBirthYearsBornByYear(childBirthYears, contributionYear).filter(
    (year) => contributionYear - year < 25,
  )
}
