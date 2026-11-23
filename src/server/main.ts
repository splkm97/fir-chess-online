import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
const config = readConfig();
const app = await buildApp(config);
let closing = false;
async function close() { if (closing) return; closing = true; await app.close(); }
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
try { const address = await app.listen({ port: config.port, host: config.host }); console.log('Omokchess listening at ' + address); } catch (error) { console.error(error); await close(); process.exitCode = 1; }
