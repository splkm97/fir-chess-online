import { performance } from 'node:perf_hooks';

export interface Clock {
  nowMs(): number;
  wallMs(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

export const realClock: Clock = {
  nowMs: () => performance.now(),
  wallMs: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, Math.max(0, delayMs));
    timer.unref();
    return () => clearTimeout(timer);
  },
};

export const TURN_MS = 60_000;
export const DISCONNECT_MS = 180_000;
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const WAITING_MS = 30 * 60 * 1000;
