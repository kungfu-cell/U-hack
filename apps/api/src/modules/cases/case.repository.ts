import type { CaseInput, CaseRecord } from '@scamtrap/contracts';

export interface StoredCase extends CaseRecord {
  ownerId: string;
}

export interface CaseRepository {
  create(record: StoredCase): Promise<StoredCase>;
  findById(id: string): Promise<StoredCase | undefined>;
  save(record: StoredCase): Promise<StoredCase>;
}

export class InMemoryCaseRepository implements CaseRepository {
  private readonly cases = new Map<string, StoredCase>();

  async create(record: StoredCase) {
    this.cases.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async findById(id: string) {
    const record = this.cases.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async save(record: StoredCase) {
    this.cases.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
}

export const appendInput = (record: StoredCase, input: CaseInput): StoredCase => ({
  ...record,
  status: 'ready',
  inputs: [...record.inputs, input],
  updatedAt: new Date().toISOString(),
});

export const toCaseRecord = ({ ownerId: _ownerId, ...record }: StoredCase): CaseRecord => record;
