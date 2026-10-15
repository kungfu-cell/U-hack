import type { RiskLevel, ScamTactic } from "@scamtrap/contracts";

export const SCORE_VERSION = "scamtrap-risk-v1";

export const tacticWeights: Readonly<Record<ScamTactic, number>> = {
  authority_impersonation: 18,
  threat_or_fear: 26,
  urgency: 20,
  money_transfer_request: 30,
  secret_request: 38,
  isolation: 24,
  remote_access_request: 34,
  guaranteed_return: 26,
};

export const toRiskLevel = (score: number): RiskLevel => {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
};

export const calculateRiskScore = (
  tactics: Iterable<ScamTactic>,
  options: { technicallyValidatedThreat?: boolean } = {},
) => {
  const uniqueTactics = new Set(tactics);
  const tacticScore = [...uniqueTactics].reduce(
    (total, tactic) => total + tacticWeights[tactic],
    0,
  );
  const combinationBonus = uniqueTactics.size >= 3 ? 12 : 0;
  const technicalValidationBonus = options.technicallyValidatedThreat ? 20 : 0;

  return Math.min(
    tacticScore + combinationBonus + technicalValidationBonus,
    100,
  );
};
