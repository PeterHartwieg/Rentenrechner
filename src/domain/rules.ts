export interface GermanRules {
  year: number
  employeeAllowance: number
  specialExpensesAllowance: number
  /** §24b EStG Entlastungsbetrag für Alleinerziehende — base amount for first child (Steuerklasse II). */
  entlastungsbetragAlleinerziehende: number
  /** §24b Abs. 2 EStG: additional amount per each child beyond the first. */
  entlastungsbetragAlleinerziehendePro: number
  /**
   * Altersvorsorgedepot 2027 constants.
   * Source: Altersvorsorgereformgesetz vom 26.05.2026 (BGBl. 2026 I Nr. 156).
   */
  altersvorsorgedepot: {
    /** First year new AVD contracts are available (2027). */
    productStartYear: number
    /** §10a EStG: own contributions deductible up to this amount per year. */
    specialExpenseOwnContributionCap: number
    /** Maximum annual contract own contribution (no extra allowance above subsidy band). */
    contractContributionCapAnnual: number
    /** Minimum own contribution required for any allowances (120 EUR/year). */
    minimumOwnContributionAnnual: number
    /** Tier-1 basic allowance: 50% of own contributions up to this amount (360 EUR). */
    basicAllowanceTier1MaxContribution: number
    basicAllowanceTier1Rate: number
    /** Tier-2 basic allowance: 25% of own contributions from tier-1 max up to 1 800 EUR. */
    basicAllowanceTier2MaxContribution: number
    basicAllowanceTier2Rate: number
    /** Maximum direct basic allowance per year (540 EUR). */
    basicAllowanceMax: number
    /** Maximum indirect spouse basic allowance per year (175 EUR). */
    indirectSpouseBasicAllowanceMax: number
    /** One-time career-starter bonus in EUR (200 EUR). */
    careerStarterBonus: number
    /** Maximum age (inclusive) for career-starter bonus (under 25 = age ≤ 24). */
    careerStarterMaxAge: number
    /** Child allowance rate: 100% of own contribution per eligible child. */
    childAllowanceRate: number
    /** Maximum child allowance per eligible child per year (300 EUR). */
    childAllowanceMax: number
    /** Standarddepot Effektivkosten cap in decimal (1.0 pp = 0.01). */
    standarddepotEffektivkostenCap: number
    /** High-risk allocation max 5 years before payout start (Standarddepot glidepath). */
    glidepathHighRiskMax5YearsBefore: number
    /** High-risk allocation max 2 years before and at payout start (Standarddepot glidepath). */
    glidepathHighRiskMax2YearsBefore: number
    /** Minimum payout start age (65). */
    payoutMinAge: number
    /** Maximum first payout age (70). */
    payoutMaxFirstAge: number
    /** Maximum partial capital payout fraction at payout start (30%). */
    partialCapitalMaxPct: number
    /** Minimum payout plan end age (85). */
    payoutPlanMinEndAge: number
    /** Max transfer cost from old provider within first 5 years (150 EUR). */
    transferCostOldProviderWithin5YearsEUR: number
    /** Max one-time admin fee from new provider (150 EUR). */
    transferCostNewProviderEUR: number
  }
  incomeTax: {
    basicAllowance: number
    firstProgressionEnd: number
    secondProgressionEnd: number
    topTaxStart: number
    /**
     * §32a Abs. 1 Satz 2 EStG Grundtarif formula coefficients. These are
     * re-issued together with the zone boundaries every assessment period,
     * so they are year-specific rules data — the engine consumes them via
     * `calculateIncomeTax2026` and contains no tariff literals of its own.
     */
    tariff: {
      /** Zone b (first progression): linear y-coefficient (914.51 for 2026). */
      zoneBLinear: number
      /** Zone b (first progression): additive constant (1 400). */
      zoneBConstant: number
      /** Zone c (second progression): linear z-coefficient (173.10 for 2026). */
      zoneCLinear: number
      /** Zone c (second progression): quadratic multiplier (2 397). */
      zoneCQuadratic: number
      /** Zone c (second progression): additive constant (1 034.87). */
      zoneCConstant: number
      /** Zone d (proportional): marginal rate (0.42 for 2026). */
      proportionalRate: number
      /** Zone d (proportional): fixed deduction (11 135.63). */
      proportionalDeduction: number
      /** Zone e (top): marginal rate (0.45 for 2026). */
      topRate: number
      /** Zone e (top): fixed deduction (19 470.38). */
      topRateDeduction: number
      /** Denominator scaling (x − zone start) into the y/z progression variables (10 000). */
      progressionDenominator: number
    }
    /** §3 Abs. 3 SolzG: Soli-Freigrenze for Einzelveranlagung. */
    solidarityFreeTax: number
    /** §3 Abs. 3 SolzG: Soli-Freigrenze for Zusammenveranlagung (= 2 × Einzelveranlagung). */
    solidarityFreeTaxMarried: number
  }
  socialSecurity: {
    pensionCapYear: number
    healthCareCapYear: number
    pensionEmployeeRate: number
    pensionEmployerRate: number
    unemploymentEmployeeRate: number
    unemploymentEmployerRate: number
    healthGeneralRate: number
    // ermäßigter Beitragssatz (without Krankengeld) — used for Vorsorgepauschale §39b EStG
    healthReducedRate: number
    careEmployeeBaseRate: number
    careEmployeeChildlessRate: number
    careEmployerRate: number
    careRetirementChildlessRate: number
    kvFreibetragVersorgungMonthly: number
    // §6 Abs. 7 SGB V / §55 Abs. 2 SGB XI: KV/PV Beitragsbemessungsgrenze monthly ceiling
    // (= healthCareCapYear / 12; same ceiling applies to both KV and PV in retirement)
    healthAndCareCapMonth: number
    // §18 SGB IV Bezugsgröße West — used for bAV minimum entitlement (§1a BetrAVG)
    bezugsgroesseMonthly: number
    // SGB VI Anlage 1 vorläufiges Durchschnittsentgelt — denominator for Entgeltpunkte
    durchschnittsentgelt: number
    // Aktueller Rentenwert West (monthly EUR per Entgeltpunkt) — for GRV pension estimation
    aktuellerRentenwert: number
  }
  bav: {
    taxFreePctOfPensionCap: number
    socialSecurityFreePctOfPensionCap: number
    statutoryEmployerSubsidyPct: number
  }
  basisrente: {
    /** §10 Abs. 3 EStG Höchstbetrag for single filers (Einzelveranlagung). */
    schicht1CapSingle: number
    /** Deductible fraction of contributions (§10 Abs. 3 EStG: 100% from 2023). */
    deductibleFraction: number
  }
  /**
   * Legacy Riester / Altersvorsorgevertrag constants (§84–§86, §10a EStG old law).
   * Applies to existing contracts in 2026. No new contracts from 2027 under the reform.
   */
  riester: {
    /** §84 EStG Grundzulage per year (175 EUR in 2026). */
    grundzulage: number
    /** §85 EStG Kinderzulage for children born before 2008 (185 EUR/year). */
    childAllowancePre2008: number
    /** §85 EStG Kinderzulage for children born from 2008 onwards (300 EUR/year). */
    childAllowancePost2007: number
    /** §84 EStG Berufseinsteiger-Bonus: one-time 200 EUR for new savers under 25. */
    careerStarterBonus: number
    /** Maximum age (inclusive) for career-starter bonus (under 25 = age ≤ 24). */
    careerStarterMaxAge: number
    /** §86 EStG Mindesteigenbeitragssatz: 4% of prior-year relevant income. */
    minEigenbeitragPct: number
    /** §86 EStG Sockelbetrag: minimum own contribution regardless of income (60 EUR/year). */
    sockelbetrag: number
    /** §10a EStG annual deductible cap including own contributions + allowances (2,100 EUR). */
    annualCapInclAllowances: number
    /** AltZertG: payout plan must run at least through this age (85). */
    payoutPlanMinEndAge: number
  }
  capitalGains: {
    taxRate: number
    solidarityRate: number
    saverAllowance: number
    // Basiszins nach §203 BewG — published by BMF each January, used for InvStG §18 Vorabpauschale
    basiszins: number
  }
}
