import { describe, expect, it } from "vitest";
import { calculateRiskScore, toRiskLevel } from "./risk.js";

describe("risk scoring", () => {
  it.each([
    [0, "low"],
    [24, "low"],
    [25, "medium"],
    [54, "medium"],
    [55, "high"],
    [79, "high"],
    [80, "critical"],
    [100, "critical"],
  ] as const)("maps score %i to %s", (score, level) => {
    expect(toRiskLevel(score)).toBe(level);
  });

  it("adds the combination bonus for three distinct tactics", () => {
    expect(
      calculateRiskScore([
        "authority_impersonation",
        "urgency",
        "money_transfer_request",
      ]),
    ).toBe(80);
  });

  it("does not increase the score for repeated evidence of one tactic", () => {
    expect(
      calculateRiskScore(["money_transfer_request", "money_transfer_request"]),
    ).toBe(30);
  });

  it("caps the score at 100", () => {
    expect(
      calculateRiskScore(
        ["secret_request", "remote_access_request", "threat_or_fear"],
        { technicallyValidatedThreat: true },
      ),
    ).toBe(100);
  });
});
