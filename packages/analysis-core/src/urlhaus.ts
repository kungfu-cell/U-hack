import type { ThreatIntelProvider } from './ports.js';

type FetchLike = typeof fetch;

interface UrlhausResponse {
  query_status?: string;
  threat?: string;
  url_status?: string;
  tags?: string[];
  urlhaus_reference?: string;
}

export class UrlhausProvider implements ThreatIntelProvider {
  readonly name = 'urlhaus-community-api';

  constructor(
    private readonly authKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!authKey.trim()) throw new Error('URLHAUS_AUTH_KEY_REQUIRED');
  }

  async checkIndicator(indicator: string) {
    let parsedIndicator: URL;
    try {
      parsedIndicator = new URL(indicator);
    } catch {
      return { status: 'unavailable' as const, message: 'INVALID_URL' };
    }

    if (!['http:', 'https:'].includes(parsedIndicator.protocol)) {
      return {
        status: 'unavailable' as const,
        message: 'UNSUPPORTED_URL_PROTOCOL',
      };
    }

    try {
      const response = await this.fetchImpl('https://urlhaus-api.abuse.ch/v1/url/', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Auth-Key': this.authKey,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ url: parsedIndicator.toString() }),
      });

      if (!response.ok) {
        return {
          status: 'unavailable' as const,
          message: `URLHAUS_HTTP_${response.status}`,
        };
      }

      const body = (await response.json()) as UrlhausResponse;
      if (body.query_status === 'no_results') {
        return {
          status: 'not_found' as const,
          message: 'ไม่พบ URL ในฐานมัลแวร์ URLhaus แต่ไม่ได้ยืนยันว่า URL ปลอดภัย',
        };
      }

      if (body.query_status !== 'ok') {
        return {
          status: 'unavailable' as const,
          message: `URLHAUS_QUERY_${body.query_status ?? 'UNKNOWN'}`,
        };
      }

      const detail = [
        body.url_status ? `สถานะ ${body.url_status}` : null,
        body.tags?.length ? `แท็ก ${body.tags.join(', ')}` : null,
      ].filter(Boolean).join(' · ');

      return {
        status: 'match' as const,
        threatType: (body.threat ?? 'malware_download').toUpperCase(),
        message: `พบ URL ในฐานมัลแวร์ URLhaus${detail ? ` · ${detail}` : ''}`,
      };
    } catch {
      return {
        status: 'unavailable' as const,
        message: 'URLHAUS_UNAVAILABLE',
      };
    }
  }
}
