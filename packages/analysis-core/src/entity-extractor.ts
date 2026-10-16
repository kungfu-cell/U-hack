import { randomUUID } from "node:crypto";
import type { EntityMention } from "@scamtrap/contracts";

interface Candidate {
  type: EntityMention["type"];
  value: string;
  normalizedValue: string;
  confidence: number;
  start: number;
  end: number;
}

const trimUrlPunctuation = (value: string) => value.replace(/[.,!?;:]+$/u, "");
const digitsOnly = (value: string) => value.replace(/\D/gu, "");
const normalizeUrl = (value: string) => {
  try {
    const withProto = value.startsWith("www.") ? `https://${value}` : value;
    return new URL(withProto).toString();
  } catch {
    return value;
  }
};

const thaiBanks = [
  { pattern: /ธนาคารกรุงเทพ|บัวหลวง/giu, normalizedValue: "bangkok_bank" },
  { pattern: /ธนาคารกสิกรไทย|กสิกร|kbank/giu, normalizedValue: "kasikornbank" },
  {
    pattern: /ธนาคารกรุงไทย|กรุงไทย|ktb/giu,
    normalizedValue: "krung_thai_bank",
  },
  {
    pattern: /ธนาคารไทยพาณิชย์|ไทยพาณิชย์|scb/giu,
    normalizedValue: "siam_commercial_bank",
  },
  {
    pattern: /ธนาคารกรุงศรีอยุธยา|กรุงศรี|bay/giu,
    normalizedValue: "bank_of_ayudhya",
  },
  { pattern: /ธนาคารทหารไทยธนชาต|ทีทีบี|ttb/giu, normalizedValue: "ttb" },
  {
    pattern: /ธนาคารออมสิน|ออมสิน|gsb/giu,
    normalizedValue: "government_savings_bank",
  },
  { pattern: /ธ\.?ก\.?ส\.?|baac/giu, normalizedValue: "baac" },
] as const;

const collectCandidates = (text: string): Candidate[] => {
  const candidates: Candidate[] = [];
  const bankAccountRanges: Array<{ start: number; end: number }> = [];

  for (const bank of thaiBanks) {
    for (const match of text.matchAll(bank.pattern)) {
      if (match.index === undefined) continue;
      candidates.push({
        type: "bank_name",
        value: match[0],
        normalizedValue: bank.normalizedValue,
        confidence: 0.98,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  const bankAccountPattern =
    /(?:(?:เลข(?:ที่)?\s*)?บัญชี(?:ธนาคาร)?(?:เลข(?:ที่)?)?|พร้อมเพย์|promptpay)\s*[:：-]?\s*((?:\d[ -]?){9,14}\d)/giu;
  for (const match of text.matchAll(bankAccountPattern)) {
    if (match.index === undefined || !match[1]) continue;
    const accountOffset = match[0].lastIndexOf(match[1]);
    const start = match.index + accountOffset;
    const normalizedValue = digitsOnly(match[1]);
    if (normalizedValue.length < 10 || normalizedValue.length > 13) continue;

    const end = start + match[1].length;
    bankAccountRanges.push({ start, end });
    candidates.push({
      type: "bank_account",
      value: match[1],
      normalizedValue,
      confidence: 0.9,
      start,
      end,
    });
  }

  const accountHolderPattern =
    /(?:ชื่อบัญชี|ชื่อผู้รับ)\s*[:：]?\s*([^\n,;|]{2,60}?)(?=\s+(?:เลขบัญชี|บัญชี|ธนาคาร|ยอด|จำนวน)(?:\s|:|$)|[\n,;|]|$)/giu;
  for (const match of text.matchAll(accountHolderPattern)) {
    if (match.index === undefined || !match[1]) continue;
    const value = match[1].trim();
    const valueOffset = match[0].indexOf(value);
    const start = match.index + valueOffset;
    candidates.push({
      type: "account_holder",
      value,
      normalizedValue: value.replace(/\s+/gu, " ").toLowerCase(),
      confidence: 0.82,
      start,
      end: start + value.length,
    });
  }

  const amountPattern =
    /(?:ยอด|จำนวน|โอน)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(บาท|฿)/giu;
  for (const match of text.matchAll(amountPattern)) {
    if (match.index === undefined || !match[1]) continue;
    const valueOffset = match[0].indexOf(match[1]);
    const start = match.index + valueOffset;
    const amount = Number(match[1].replace(/,/gu, ""));
    if (!Number.isFinite(amount)) continue;
    candidates.push({
      type: "money_amount",
      value: `${match[1]}${match[2] ?? ""}`,
      normalizedValue: `${amount.toFixed(2)} THB`,
      confidence: 0.96,
      start,
      end: match.index + match[0].length,
    });
  }

  const urlPattern = /(?:https?:\/\/|www\.)[^\s<>()]+/giu;
  for (const match of text.matchAll(urlPattern)) {
    if (match.index === undefined) continue;
    const value = trimUrlPunctuation(match[0]);
    candidates.push({
      type: "url",
      value,
      normalizedValue: normalizeUrl(value),
      confidence: 0.98,
      start: match.index,
      end: match.index + value.length,
    });
  }

  const emailPattern =
    /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu;
  for (const match of text.matchAll(emailPattern)) {
    if (match.index === undefined) continue;
    candidates.push({
      type: "email",
      value: match[0],
      normalizedValue: match[0].toLowerCase(),
      confidence: 0.98,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  const linePattern =
    /(?:line\s*(?:id)?|ไลน์(?:ไอดี)?)\s*[:：]?\s*(@?[a-z0-9._-]{3,30})/giu;
  for (const match of text.matchAll(linePattern)) {
    if (match.index === undefined || !match[1]) continue;
    const valueOffset = match[0].lastIndexOf(match[1]);
    const start = match.index + valueOffset;
    candidates.push({
      type: "line_id",
      value: match[1],
      normalizedValue: match[1].toLowerCase(),
      confidence: 0.92,
      start,
      end: start + match[1].length,
    });
  }

  const phonePattern = /(?:\+66|0)(?:[ -]?\d){8,9}/gu;
  for (const match of text.matchAll(phonePattern)) {
    if (match.index === undefined) continue;
    const end = match.index + match[0].length;
    const overlapsBankAccount = bankAccountRanges.some(
      (range) => match.index! < range.end && end > range.start,
    );
    if (overlapsBankAccount) continue;

    const digits = digitsOnly(match[0]);
    const normalizedValue = match[0].startsWith("+66")
      ? `0${digits.slice(2)}`
      : digits;
    candidates.push({
      type: "phone",
      value: match[0],
      normalizedValue,
      confidence: 0.88,
      start: match.index,
      end,
    });
  }

  return candidates;
};

export const extractEntities = (
  text: string,
  sourceId: string,
): EntityMention[] => {
  const seen = new Set<string>();

  return collectCandidates(text)
    .sort((left, right) => left.start - right.start)
    .filter((candidate) => {
      const key = `${candidate.type}:${candidate.normalizedValue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => ({
      id: randomUUID(),
      type: candidate.type,
      value: candidate.value,
      normalizedValue: candidate.normalizedValue,
      sourceId,
      start: candidate.start,
      end: candidate.end,
      speaker: "unknown",
      confidence: candidate.confidence,
      verified: false,
    }));
};
