import { describe, expect, it } from "vitest";
import { removeRepeatedOpeningGreeting } from "./agent-client.js";

describe("removeRepeatedOpeningGreeting", () => {
  it("keeps the greeting on the first agent turn", () => {
    const text = "[polite] สวัสดีค่ะ ดิฉันขอรับช่วงสายแทนนะคะ";

    expect(removeRepeatedOpeningGreeting(text, false)).toBe(text);
  });

  it("removes a Thai greeting from a follow-up turn", () => {
    expect(
      removeRepeatedOpeningGreeting(
        "[polite] สวัสดีค่ะ ขอทราบหมายเลขประจำตัวเจ้าหน้าที่ได้ไหมคะ",
        true,
      ),
    ).toBe("ขอทราบหมายเลขประจำตัวเจ้าหน้าที่ได้ไหมคะ");
  });

  it("removes an English greeting from a follow-up turn", () => {
    expect(
      removeRepeatedOpeningGreeting(
        "Hello there, could you repeat your badge number?",
        true,
      ),
    ).toBe("could you repeat your badge number?");
  });
});
