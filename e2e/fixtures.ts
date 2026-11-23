import { test as base, expect } from '@playwright/test';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const test = base.extend<object, { appUrl: string }>({
  appUrl: [async ({}, use) => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('No ephemeral test port');
    const port = address.port;
    const released = Promise.withResolvers<void>();
    reservation.close(error => error ? released.reject(error) : released.resolve());
    await released.promise;
    const directory = await mkdtemp(join(tmpdir(), 'omokchess-e2e-'));
    const appUrl = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, [resolve('dist/server/main.js')], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: appUrl, DATABASE_PATH: join(directory, 'game.sqlite'), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    try {
      const ready = Promise.withResolvers<void>();
      const timeout = setTimeout(() => ready.reject(new Error(`Server readiness timeout: ${output}`)), 15_000);
      const fail = (error: Error) => { clearTimeout(timeout); ready.reject(error); };
      server.once('error', fail);
      server.once('exit', code => fail(new Error(`Server exited ${code}: ${output}`)));
      server.stderr.on('data', data => { output += String(data); });
      server.stdout.on('data', data => {
        output += String(data);
        if (output.includes('Omokchess listening')) { clearTimeout(timeout); ready.resolve(); }
      });
      await ready.promise;
      await use(appUrl);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit');
        server.kill('SIGTERM');
        const force = setTimeout(() => server.kill('SIGKILL'), 5000);
        await exited; clearTimeout(force);
      }
      await rm(directory, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],
  baseURL: async ({ appUrl }, use) => { await use(appUrl); },
});
export { expect };
