import {
  apiErrorSchema,
  audioUploadResponseSchema,
  caseSchema,
  incidentReportSchema,
  shareProposalSchema,
  sessionSnapshotSchema,
  utteranceSchema,
  type AddCaseInputRequest,
  type AudioUploadResponse,
  type CaseRecord,
  type IncidentReport,
  type ShareProposal,
  type SessionSnapshot,
  type Utterance,
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

export const uploadCaseAudio = (
  caseId: string,
  input: { fileName: string; mimeType: string; audioBase64: string; consentConfirmed: true },
) =>
  request<AudioUploadResponse>(
    `/cases/${caseId}/audio-uploads`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    (data) => audioUploadResponseSchema.parse(data),
  );

export const getCaseReport = (caseId: string) =>
  request<IncidentReport>(
    `/cases/${caseId}/report`,
    { method: 'GET' },
    (data) => incidentReportSchema.parse(data),
  );

export const createShareProposal = (caseId: string, indicatorIds: string[]) =>
  request<ShareProposal>(
    `/cases/${caseId}/share-proposals`,
    {
      method: 'POST',
      body: JSON.stringify({ indicatorIds, consentConfirmed: true }),
    },
    (data) => shareProposalSchema.parse(data),
  );

export const deleteCase = async (caseId: string) => {
  const response = await fetch(`${apiUrl}/cases/${caseId}`, {
    method: 'DELETE',
    headers: { 'x-user-id': 'demo-user' },
  });
  if (!response.ok) throw new Error('ลบเหตุการณ์ไม่สำเร็จ');
};

export const withdrawCase = (caseId: string, reason: string) =>
  request<{ caseId: string; status: string }>(
    `/cases/${caseId}/withdrawal`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, maskInputs: true }),
    },
    (data) => data as { caseId: string; status: string },
  );

export const getSessionSnapshot = (sessionId: string) =>
  request<SessionSnapshot>(
    `/sessions/${sessionId}/snapshot`,
    { method: 'GET' },
    (data) => sessionSnapshotSchema.parse(data),
  );

export const correctSessionUtterance = (sessionId: string, utteranceId: string, text: string) =>
  request<Utterance>(
    `/sessions/${sessionId}/utterances/${utteranceId}`,
    { method: 'PATCH', body: JSON.stringify({ text }) },
    (data) => utteranceSchema.parse(data),
  );
