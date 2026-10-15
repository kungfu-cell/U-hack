import type { ThreatIntelProvider } from "./ports.js";

type FetchLike = typeof fetch;

interface SafeBrowsingResponse {
  threats?: Array<{
    url?: string;
    threatTypes?: string[];
  }>;
  cacheDuration?: string;
}

const threatTypeNames: Record<number, string> = {
  1: "MALWARE",
  2: "SOCIAL_ENGINEERING",
  3: "UNWANTED_SOFTWARE",
  4: "POTENTIALLY_HARMFUL_APPLICATION",
};

const readVarint = (bytes: Uint8Array, start: number) => {
  let value = 0;
  let shift = 0;
  let cursor = start;
  while (cursor < bytes.length && shift <= 28) {
    const byte = bytes[cursor++]!;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value >>> 0, cursor };
    shift += 7;
  }
  throw new Error("INVALID_PROTOBUF_VARINT");
};

const readLengthDelimited = (bytes: Uint8Array, start: number) => {
  const length = readVarint(bytes, start);
  const end = length.cursor + length.value;
  if (end > bytes.length) throw new Error("INVALID_PROTOBUF_LENGTH");
  return { value: bytes.subarray(length.cursor, end), cursor: end };
};

const skipField = (bytes: Uint8Array, start: number, wireType: number) => {
  if (wireType === 0) return readVarint(bytes, start).cursor;
  if (wireType === 1) return start + 8;
  if (wireType === 2) return readLengthDelimited(bytes, start).cursor;
  if (wireType === 5) return start + 4;
  throw new Error("UNSUPPORTED_PROTOBUF_WIRE_TYPE");
};

const decodeThreatUrl = (bytes: Uint8Array) => {
  let cursor = 0;
  let url: string | undefined;
  const threatTypes: string[] = [];
  while (cursor < bytes.length) {
    const tag = readVarint(bytes, cursor);
    cursor = tag.cursor;
    const field = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (field === 1 && wireType === 2) {
      const value = readLengthDelimited(bytes, cursor);
      url = new TextDecoder().decode(value.value);
      cursor = value.cursor;
    } else if (field === 2 && wireType === 0) {
      const value = readVarint(bytes, cursor);
      threatTypes.push(threatTypeNames[value.value] ?? `UNKNOWN_THREAT_TYPE_${value.value}`);
      cursor = value.cursor;
    } else if (field === 2 && wireType === 2) {
      const packed = readLengthDelimited(bytes, cursor);
      let packedCursor = 0;
      while (packedCursor < packed.value.length) {
        const value = readVarint(packed.value, packedCursor);
        threatTypes.push(threatTypeNames[value.value] ?? `UNKNOWN_THREAT_TYPE_${value.value}`);
        packedCursor = value.cursor;
      }
      cursor = packed.cursor;
    } else {
      cursor = skipField(bytes, cursor, wireType);
    }
  }
  return { ...(url ? { url } : {}), threatTypes };
};

const decodeSafeBrowsingResponse = (bytes: Uint8Array): SafeBrowsingResponse => {
  let cursor = 0;
  const threats: NonNullable<SafeBrowsingResponse["threats"]> = [];
  while (cursor < bytes.length) {
    const tag = readVarint(bytes, cursor);
    cursor = tag.cursor;
    const field = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (field === 1 && wireType === 2) {
      const value = readLengthDelimited(bytes, cursor);
      threats.push(decodeThreatUrl(value.value));
      cursor = value.cursor;
    } else {
      cursor = skipField(bytes, cursor, wireType);
    }
  }
  return { threats };
};

export class GoogleSafeBrowsingProvider implements ThreatIntelProvider {
  readonly name = "google-safe-browsing-v5";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!apiKey.trim()) {
      throw new Error("GOOGLE_SAFE_BROWSING_API_KEY_REQUIRED");
    }
  }

  async checkIndicator(indicator: string) {
    let parsedIndicator: URL;
    try {
      parsedIndicator = new URL(indicator);
    } catch {
      return { status: "unavailable" as const, message: "INVALID_URL" };
    }

    if (!["http:", "https:"].includes(parsedIndicator.protocol)) {
      return {
        status: "unavailable" as const,
        message: "UNSUPPORTED_URL_PROTOCOL",
      };
    }

    const endpoint = new URL(
      "https://safebrowsing.googleapis.com/v5/urls:search",
    );
    endpoint.searchParams.append("urls", parsedIndicator.toString());
    endpoint.searchParams.set("key", this.apiKey);

    try {
      const response = await this.fetchImpl(endpoint, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        return {
          status: "unavailable" as const,
          message: `SAFE_BROWSING_HTTP_${response.status}`,
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? ((await response.json()) as SafeBrowsingResponse)
        : decodeSafeBrowsingResponse(new Uint8Array(await response.arrayBuffer()));
      const threatTypes = [
        ...new Set(
          (body.threats ?? []).flatMap((threat) => threat.threatTypes ?? []),
        ),
      ];

      if (threatTypes.length === 0) {
        return {
          status: "not_found" as const,
          message:
            "ไม่พบในรายการภัยที่ตรวจ แต่ไม่ได้ยืนยันว่า URL ปลอดภัย — Advisory provided by Google",
        };
      }

      return {
        status: "match" as const,
        threatType: threatTypes.join(","),
        message:
          "พบ URL ในรายการภัยของ Google Safe Browsing — Advisory provided by Google",
      };
    } catch {
      return {
        status: "unavailable" as const,
        message: "SAFE_BROWSING_UNAVAILABLE",
      };
    }
  }
}
