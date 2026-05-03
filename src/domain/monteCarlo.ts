export interface MonteCarloAssumptions {
  /** Enable/disable stochastic projection in the UI without losing settings. */
  enabled: boolean
  /** Number of simulated market paths. Kept bounded by scenarioSchema for UI performance. */
  runs: number
  /** Annualized volatility of the risky market sleeve, e.g. 0.15 = 15% p.a. */
  annualVolatility: number
  /** Deterministic seed so saved/shared scenarios reproduce the same risk result. */
  seed: number
}
