import { randomUUID } from 'node:crypto';
import type { AnalysisProvider } from '@scamtrap/analysis-core';
import type {
  AddCaseInputRequest,
  CaseInput,
  CreateCaseRequest,
} from '@scamtrap/contracts';
import {
  appendInput,
  type CaseRepository,
  type StoredCase,
} from './case.repository.js';

export class CaseService {
  constructor(
    private readonly repository: CaseRepository,
    private readonly analysisProvider: AnalysisProvider,
  ) {}

  async create(ownerId: string, request: CreateCaseRequest) {
    const now = new Date().toISOString();
    return this.repository.create({
      id: randomUUID(),
      ownerId,
      title: request.title,
      status: 'draft',
      isDemo: request.isDemo,
      inputs: [],
      latestAnalysis: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get(id: string) {
    return this.repository.findById(id);
  }

  async addInput(record: StoredCase, request: AddCaseInputRequest) {
    const input: CaseInput = {
      id: randomUUID(),
      type: request.type,
      content: request.content,
      source: request.source,
      createdAt: new Date().toISOString(),
    };

    return this.repository.save(appendInput(record, input));
  }

  async analyze(record: StoredCase) {
    const analyzableInputs = record.inputs.filter((input) => input.type !== 'audio');
    if (analyzableInputs.length === 0) {
      throw new Error('CASE_HAS_NO_ANALYZABLE_INPUT');
    }

    await this.repository.save({
      ...record,
      status: 'analyzing',
      updatedAt: new Date().toISOString(),
    });

    const combinedText = analyzableInputs.map((input) => input.content).join('\n');
    const result = await this.analysisProvider.analyzeText({
      sourceId: analyzableInputs[0]!.id,
      text: combinedText,
      isDemo: record.isDemo,
    });

    return this.repository.save({
      ...record,
      status: 'completed',
      latestAnalysis: result,
      updatedAt: new Date().toISOString(),
    });
  }
}
