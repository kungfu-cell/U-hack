import type { EntityMention } from "@scamtrap/contracts";

const sensitiveTypes = new Set<EntityMention["type"]>([
  "phone",
  "bank_account",
  "account_holder",
  "line_id",
  "email",
]);

export interface RedactionResult {
  text: string;
  redactedEntityIds: string[];
}

export const redactSensitiveEntities = (
  text: string,
  entities: readonly EntityMention[],
): RedactionResult => {
  const selected = entities
    .filter((entity) => sensitiveTypes.has(entity.type))
    .filter((entity) => text.slice(entity.start, entity.end) === entity.value)
    .sort((left, right) => right.start - left.start);

  let redactedText = text;
  const redactedEntityIds: string[] = [];

  for (const [index, entity] of selected.entries()) {
    const placeholder = `[REDACTED_${entity.type.toUpperCase()}_${selected.length - index}]`;
    redactedText = `${redactedText.slice(0, entity.start)}${placeholder}${redactedText.slice(entity.end)}`;
    redactedEntityIds.push(entity.id);
  }

  redactedText = redactedText.replace(
    /((?:otp|pin|รหัสผ่าน|รหัสยืนยัน)\s*[:：]?\s*)\d{4,8}/giu,
    "$1[REDACTED_SECRET]",
  );

  return { text: redactedText, redactedEntityIds };
};
