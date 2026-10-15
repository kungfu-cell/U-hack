import type { ThreatIntelProvider } from "./ports.js";

type FetchLike = typeof fetch;

interface SafeBrowsingResponse {
  threats?: Array<{
    url?: string;
    threatTypes?: string[];
  }>;
  cacheDuration?: string;
}

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

      const body = (await response.json()) as SafeBrowsingResponse;
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
