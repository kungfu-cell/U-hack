import { randomUUID } from "node:crypto";
import type { Evidence } from "@scamtrap/contracts";
import { calculateRiskScore } from "./risk.js";
import { scamRules, type ScamRule } from "./rules.js";

export interface RuleDetectionResult {
  evidence: Evidence[];
  rawScore: number;
}

const NEGATION_LOOKBEHIND = 16;

const cloneForGlobalSearch = (pattern: RegExp) =>
  new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );

const isIgnoredMatch = (
  text: string,
  matchIndex: number,
  matchLength: number,
  rule: ScamRule,
) => {
  if (!rule.ignoredWhen) return false;

  // A negation must be attached closely to the matched request. Looking too far
  // across a sentence can hide a real request (for example: "ห้ามบอกใคร แล้วโอนเงิน").
  const start = Math.max(0, matchIndex - NEGATION_LOOKBEHIND);
  const end = matchIndex + matchLength;
  return rule.ignoredWhen.test(text.slice(start, end));
};

export const detectRuleEvidence = (
  text: string,
  sourceId: string,
  rules: readonly ScamRule[] = scamRules,
): RuleDetectionResult => {
  const evidence: Evidence[] = [];
  const matchedTactics = new Set<ScamRule["tactic"]>();

  for (const rule of rules) {
    const pattern = cloneForGlobalSearch(rule.pattern);

    for (const match of text.matchAll(pattern)) {
      if (
        match.index === undefined ||
        isIgnoredMatch(text, match.index, match[0].length, rule)
      ) {
        continue;
      }

      evidence.push({
        id: randomUUID(),
        quote: match[0],
        start: match.index,
        end: match.index + match[0].length,
        tactic: rule.tactic,
        explanation: rule.explanation,
        sourceId,
        confidence: 1,
      });
      matchedTactics.add(rule.tactic);
    }
  }

  return {
    evidence: evidence.sort((left, right) => left.start - right.start),
    rawScore: calculateRiskScore(matchedTactics),
  };
};
