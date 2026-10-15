import {
  apiErrorSchema,
  caseSchema,
  type AddCaseInputRequest,
  type CaseRecord,
} from '@scamtrap/contracts';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const request = async <T>(path: string, init: RequestInit, parse: (data: unknown) => T) => {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'demo-user',
      ...init.headers,
    },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new Error(parsed.success ? parsed.data.error.message : 'API request failed');
  }
  return parse(data);
};

export const createCase = () =>
  request<CaseRecord>(
    '/cases',
    { method: 'POST', body: JSON.stringify({ title: 'Quick analysis', isDemo: true }) },
    (data) => caseSchema.parse(data),
  );

export const addCaseInput = (caseId: string, input: AddCaseInputRequest) =>
  request<CaseRecord>(
    `/cases/${caseId}/inputs`,
    { method: 'POST', body: JSON.stringify(input) },
    (data) => caseSchema.parse(data),
  );

export const analyzeCase = (caseId: string) =>
  request<CaseRecord>(
    `/cases/${caseId}/analyses`,
    { method: 'POST', body: '{}' },
    (data) => caseSchema.parse(data),
  );
