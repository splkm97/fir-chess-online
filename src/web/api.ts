import { z } from 'zod';
import { httpErrorSchema, roomCreatedSchema, roomSchema, sessionSchema } from '../protocol/messages.ts';
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
  createRoom: () => request('/api/rooms', roomCreatedSchema, {}),
  joinRoom: (code: string) => request(`/api/rooms/${encodeURIComponent(code)}/join`, roomCreatedSchema, {}),
  room: (code: string, signal?: AbortSignal) => request(`/api/rooms/${encodeURIComponent(code)}`, roomSchema, undefined, signal),
};
export function caughtMessage(error: unknown): string { return error instanceof ApiError ? error.message : '처리 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.'; }
