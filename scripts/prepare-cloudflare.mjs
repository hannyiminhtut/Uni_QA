import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadKnowledge } from '../lib/knowledge.js';

const root = resolve('.cloudflare');
const frontend = join(root, 'frontend');
for (const dir of ['app', 'lib', 'public']) await mkdir(join(frontend, dir), { recursive: true });
for (const file of ['page.js', 'layout.js', 'globals.css']) await copyFile(join('app', file), join(frontend, 'app', file));
for (const file of ['chat-client.js', 'answer-format.js']) await copyFile(join('lib', file), join(frontend, 'lib', file));
// Copy only explicitly public assets, never data/, .dev.vars, or evaluation/.
for (const entry of await readdir('public', { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(entry.name)) throw new Error(`Unexpected public asset: ${entry.name}`);
  await copyFile(join('public', entry.name), join(frontend, 'public', entry.name));
}
await writeFile(join(frontend, 'next.config.mjs'), "export default { output: 'export', poweredByHeader: false, devIndicators: false, images: { unoptimized: true } };\n");
await writeFile(join(frontend, 'package.json'), JSON.stringify({ name: 'uit-compass-static', private: true, type: 'module' }));
await writeFile(join(root, 'knowledge.json'), JSON.stringify(await loadKnowledge()));
console.log('Prepared static Next.js workspace and server-only knowledge bundle. No secrets copied.');
