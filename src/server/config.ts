import { resolve } from 'node:path';
export interface Config { host: string; port: number; origin: string; databasePath: string; production: boolean }
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
  const origin = new URL(env.PUBLIC_ORIGIN ?? 'http://localhost:5173');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP origin');
  if (production && (origin.protocol !== 'https:' || !env.DATABASE_PATH)) throw new Error('Production requires HTTPS PUBLIC_ORIGIN and DATABASE_PATH');
  return { host: env.HOST ?? '0.0.0.0', port, origin: origin.origin, databasePath: resolve(env.DATABASE_PATH ?? 'data/omokchess.sqlite'), production };
}
