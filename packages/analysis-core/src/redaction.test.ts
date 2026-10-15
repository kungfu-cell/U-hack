import { describe, expect, it } from "vitest";
import { extractEntities } from "./entity-extractor.js";
import { redactSensitiveEntities } from "./redaction.js";

describe("redactSensitiveEntities", () => {
  it("redacts contact and bank values but keeps non-sensitive amounts", () => {
    const text =
      "บัญชี 123-4-56789-0 โทร 0812345678 อีเมล victim@example.com OTP 654321 จำนวน 5,000 บาท";
    const entities = extractEntities(text, "source-1");

    const result = redactSensitiveEntities(text, entities);

    expect(result.text).not.toContain("123-4-56789-0");
    expect(result.text).not.toContain("0812345678");
    expect(result.text).not.toContain("victim@example.com");
    expect(result.text).not.toContain("654321");
    expect(result.text).toContain("OTP [REDACTED_SECRET]");
    expect(result.text).toContain("5,000 บาท");
    expect(result.redactedEntityIds.length).toBe(3);
  });
});
