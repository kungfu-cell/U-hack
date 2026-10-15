import type { ThreatIntelProvider } from "./ports.js";

type FetchLike = typeof fetch;

interface WebRiskResponse {
  threat?: {
    threatTypes?: string[];
  };
}

export class GoogleWebRiskProvider implements ThreatIntelProvider {
  readonly name = "google-web-risk-lookup-v1";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("GOOGLE_WEB_RISK_API_KEY_REQUIRED");
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

    const endpoint = new URL("https://webrisk.googleapis.com/v1/uris:search");
    endpoint.searchParams.append("threatTypes", "MALWARE");
    endpoint.searchParams.append("threatTypes", "SOCIAL_ENGINEERING");
    endpoint.searchParams.set("uri", parsedIndicator.toString());
    endpoint.searchParams.set("key", this.apiKey);

    try {
      const response = await this.fetchImpl(endpoint);
      if (!response.ok) {
        return {
          status: "unavailable" as const,
          message: `WEB_RISK_HTTP_${response.status}`,
        };
      }

      const body = (await response.json()) as WebRiskResponse;
      const threatTypes = body.threat?.threatTypes ?? [];
      if (threatTypes.length === 0) {
        return {
          status: "not_found" as const,
          message: "ไม่พบในรายการภัยที่ตรวจ แต่ไม่ได้ยืนยันว่า URL ปลอดภัย",
        };
      }

      return {
        status: "match" as const,
        threatType: threatTypes.join(","),
        message: "พบ URL ในรายการภัยของ Google Web Risk",
      };
    } catch {
      return {
        status: "unavailable" as const,
        message: "WEB_RISK_UNAVAILABLE",
      };
    }
  }
}
