import { z } from 'zod';
import { httpErrorSchema, roomCreatedSchema, roomSchema, sessionSchema } from '../protocol/messages.ts';
import type { TimeControlInput } from '../protocol/messages.ts';
import { analysisPageSchema, analysisSavedSchema, movesPageSchema, recordDetailSchema, recordsPageSchema } from '../protocol/records.ts';
import type { AnalysisInput } from '../protocol/records.ts';
import { errorText } from './labels.ts';
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 0) { super(errorText(code)); this.code = code; this.status = status; }
}
async function request<T>(path: string, schema: z.ZodType<T>, body?: object, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
  } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new ApiError('NETWORK_ERROR'); }
  let json: unknown;
  try { json = await response.json(); } catch { throw new ApiError('INVALID_RESPONSE', response.status); }
  if (!response.ok) {
    const parsed = httpErrorSchema.safeParse(json);
    throw new ApiError(parsed.success ? parsed.data.code : response.status === 401 ? 'UNAUTHORIZED' : 'SERVER_ERROR', response.status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError('INVALID_RESPONSE', response.status);
  return parsed.data;
}
export const api = {
  session: (signal?: AbortSignal) => request('/api/session', sessionSchema, undefined, signal),
  startSession: (nickname: string) => request('/api/session', sessionSchema, { nickname }),
  createRoom: (timeControl: TimeControlInput) => request('/api/rooms', roomCreatedSchema, { timeControl }),
  joinRoom: (code: string) => request(`/api/rooms/${encodeURIComponent(code)}/join`, roomCreatedSchema, {}),
  room: (code: string, signal?: AbortSignal) => request(`/api/rooms/${encodeURIComponent(code)}`, roomSchema, undefined, signal),
  records: (cursor: string | null, signal?: AbortSignal) => request(`/api/records${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, recordsPageSchema, undefined, signal),
  record: (code: string, signal?: AbortSignal) => request(`/api/records/${encodeURIComponent(code)}`, recordDetailSchema, undefined, signal),
  moves: (code: string, afterPly: number, signal?: AbortSignal) => request(`/api/records/${encodeURIComponent(code)}/moves?afterPly=${afterPly}&limit=200`, movesPageSchema, undefined, signal),
  analysis: (code: string, cursor: string | null, signal?: AbortSignal) => request(`/api/records/${encodeURIComponent(code)}/analysis${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, analysisPageSchema, undefined, signal),
  saveAnalysis: (code: string, input: AnalysisInput) => request(`/api/records/${encodeURIComponent(code)}/analysis/nodes`, analysisSavedSchema, input),
};
export function caughtMessage(error: unknown): string { return error instanceof ApiError ? error.message : '처리 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.'; }
