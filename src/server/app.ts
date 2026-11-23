import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { httpErrorSchema, roomCreatedSchema, roomSchema, sessionInputSchema, sessionSchema } from '../protocol/messages.ts';
import type { Config } from './config.ts';
import { realClock } from './clock.ts';
import type { Clock } from './clock.ts';
import { openStore, ServiceError } from './store.ts';
import type { Store } from './store.ts';
import { createSessions } from './session.ts';
import { createLobby } from './lobby.ts';
import { createMatchService } from './match.ts';
import type { MatchService } from './match.ts';
import { registerSockets } from './socket.ts';

export interface AppDependencies { store?: Store; clock?: Clock; match?: MatchService }

export async function buildApp(config: Config, dependencies: AppDependencies = {}) {
  const app = Fastify({
    bodyLimit: 16_384, trustProxy: false, requestTimeout: 15_000, connectionTimeout: 15_000,
    keepAliveTimeout: 5000, logger: config.production,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const clock = dependencies.clock ?? realClock;
  const store = dependencies.store ?? openStore(config.databasePath);
  const match = dependencies.match ?? createMatchService(store, clock, error => app.log.error({ err: error }, 'Match timer failed'));
  const counters = new Map<string, { window: number; count: number }>();
  function rateLimit(key: string, maximum: number) {
    const window = Math.floor(clock.nowMs() / 60_000);
    const counter = counters.get(key);
    if (!counter || counter.window !== window) { counters.set(key, { window, count: 1 }); return; }
    if (++counter.count > maximum) throw new ServiceError('RATE_LIMITED', 429);
  }
  const responses = (success: z.ZodType) => ({
    200: z.toJSONSchema(success, { target: 'draft-7' }), '4xx': z.toJSONSchema(httpErrorSchema, { target: 'draft-7' }), '5xx': z.toJSONSchema(httpErrorSchema, { target: 'draft-7' }),
  });
  const emptyBody = { type: 'object', additionalProperties: false, properties: {} };
  const params = { type: 'object', additionalProperties: false, required: ['code'], properties: { code: { type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{12}$' } } };
  let cancelCleanup: (() => void) | undefined;
  let closeSockets: (() => void) | undefined;
  app.addHook('preClose', async () => { cancelCleanup?.(); closeSockets?.(); match.close(); });
  app.addHook('onClose', async () => { store.close(); });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServiceError) return reply.code(error.statusCode).send({ code: error.code });
    if (error instanceof z.ZodError) return reply.code(400).send({ code: 'INVALID_REQUEST', message: error.issues[0]?.message ?? 'Invalid request' });
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ code: error.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST' });
    }
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({ code: 'SERVER_ERROR' });
  });
  try {
    store.recover(clock.wallMs());
    store.cleanup(clock.wallMs());
    await app.register(cookie);
    await app.register(websocket, { options: { maxPayload: 16_384, perMessageDeflate: false } });
    const sessions = createSessions(store, clock, config);
    const lobby = createLobby(store, clock, match.notify);
    app.addHook('onRequest', async (request, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Referrer-Policy', 'same-origin');
      if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
      if (request.method === 'POST') {
        if ((request.headers.origin && request.headers.origin !== config.origin) || request.headers['sec-fetch-site'] === 'cross-site') throw new ServiceError('ORIGIN_FORBIDDEN', 403);
        rateLimit(`ip:${request.ip}`, 120);
      }
    });
    app.get('/api/health', { schema: { response: { 200: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'], additionalProperties: false } } } }, async () => ({ ready: true }));
    app.post<{ Body: { nickname: string } }>('/api/session', {
      schema: { body: { type: 'object', properties: { nickname: { type: 'string', maxLength: 200 } }, required: ['nickname'], additionalProperties: false }, response: responses(sessionSchema) },
    }, async (request, reply) => {
      const { nickname } = sessionInputSchema.parse(request.body);
      rateLimit(`session-ip:${request.ip}`, 30);
      const session = sessions.authenticate(request, reply) ?? sessions.create(nickname, reply);
      return { nickname: session.nickname, roomCode: store.latestRoom(session.id, clock.wallMs()) ?? null };
    });
    app.get('/api/session', { schema: { response: responses(sessionSchema) } }, async (request, reply) => {
      const session = sessions.require(request, reply);
      return { nickname: session.nickname, roomCode: store.latestRoom(session.id, clock.wallMs()) ?? null };
    });
    app.post('/api/rooms', { schema: { body: emptyBody, response: responses(roomCreatedSchema) } }, async (request, reply) => {
      const session = sessions.require(request, reply);
      rateLimit(`room:${session.id}`, 30);
      return { code: lobby.create(session) };
    });
    app.post<{ Params: { code: string } }>('/api/rooms/:code/join', { schema: { params, body: emptyBody, response: responses(roomCreatedSchema) } }, async (request, reply) => {
      const session = sessions.require(request, reply);
      rateLimit(`room:${session.id}`, 30);
      return { code: lobby.join(session, request.params.code) };
    });
    app.get<{ Params: { code: string } }>('/api/rooms/:code', { schema: { params, response: responses(roomSchema) } }, async (request, reply) => match.snapshot(request.params.code, sessions.require(request, reply).id));
    const transport = registerSockets(app, store, match, clock, request => sessions.require(request), config.origin);
    closeSockets = transport.close;
    function cleanup() {
      try { transport.expire(store.cleanup(clock.wallMs())); }
      catch (error) { app.log.error({ err: error }, 'Expiry cleanup failed'); }
      const window = Math.floor(clock.nowMs() / 60_000);
      for (const [key, counter] of counters) if (counter.window !== window) counters.delete(key);
      cancelCleanup = clock.schedule(cleanup, 60_000);
    }
    cancelCleanup = clock.schedule(cleanup, 60_000);
    const root = resolve(import.meta.dirname, '../web');
    if (import.meta.filename.endsWith('.js')) {
      if (!existsSync(resolve(root, 'index.html'))) throw new Error('Built web assets are missing; run npm run build');
      await app.register(staticFiles, { root });
      app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method) || !request.headers.accept?.includes('text/html')) return reply.code(404).send({ code: 'NOT_FOUND' });
        return reply.sendFile('index.html', { cacheControl: false });
      });
    } else app.setNotFoundHandler((_request, reply) => reply.code(404).send({ code: 'NOT_FOUND' }));
    await app.ready();
    return app;
  } catch (error) { await app.close(); throw error; }
}
