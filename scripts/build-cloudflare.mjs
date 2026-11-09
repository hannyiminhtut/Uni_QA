import './prepare-cloudflare.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'build', resolve('.cloudflare/frontend'), '--webpack'], {
  stdio: 'inherit', windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
child.on('error', () => { console.error('Could not start the static frontend build.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
