import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Config } from './config.ts';
export async function buildApp(config: Config) {
  const app = Fastify({ bodyLimit: 16384, trustProxy: false });
  app.get('/api/health', { schema: { response: { 200: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'], additionalProperties: false } } } }, async () => ({ ready: true }));
  const root = resolve(import.meta.dirname, '../web');
  if (existsSync(resolve(root, 'index.html')) && import.meta.filename.endsWith('.js')) {
    await app.register(staticFiles, { root });
    app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ code: 'NOT_FOUND' }) : reply.sendFile('index.html', { cacheControl: false }));
  }
  return app;
}
