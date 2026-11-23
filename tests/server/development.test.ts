import { expect, it } from 'vitest';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { httpFixture } from '../helpers/server.ts';

it('serves the client API module while proxying API routes to the real backend', async () => {
  const backend = await httpFixture();
  const address = await backend.app.listen({ port: 0, host: '127.0.0.1' });
  const vite = await createServer({
    configFile: resolve('vite.config.ts'),
    logLevel: 'error',
    server: { port: 0, proxy: { '/api/': { target: address, ws: true } } },
  });
  try {
    await vite.listen();
    const bound = vite.httpServer?.address();
    if (!bound || typeof bound === 'string') throw new Error('Vite did not bind a TCP port');
    const origin = `http://127.0.0.1:${bound.port}`;
    const module = await fetch(`${origin}/api.ts`);
    expect(module.status).toBe(200);
    expect(module.headers.get('content-type')).toContain('javascript');
    const health = await fetch(`${origin}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ready: true });
  } finally {
    await vite.close();
    await backend.close();
  }
});
