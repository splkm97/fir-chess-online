import { spawn } from 'node:child_process';
const children = ['dev:server', 'dev:web'].map(script => spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { stdio: 'inherit' }));
let closing = false;
function close(code = 0) { if (closing) return; closing = true; process.exitCode = code; for (const child of children) child.kill('SIGTERM'); }
for (const child of children) { child.on('error', error => { console.error(error.message); close(1); }); child.on('exit', code => close(code ?? 1)); }
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
