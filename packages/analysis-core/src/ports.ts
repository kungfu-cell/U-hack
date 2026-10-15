import type { AnalysisResult } from '@scamtrap/contracts';

export interface AnalyzeTextCommand {
  sourceId: string;
  text: string;
  isDemo: boolean;
}

export interface AnalysisProvider {
  readonly name: string;
  analyzeText(command: AnalyzeTextCommand): Promise<AnalysisResult>;
}

export interface ThreatIntelProvider {
  readonly name: string;
  checkIndicator(indicator: string): Promise<{
    status: 'match' | 'not_found' | 'unavailable';
    threatType?: string;
    message?: string;
  }>;
}
