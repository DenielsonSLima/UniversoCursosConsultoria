import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const directory = join(tmpdir(), 'universo-ead-revision-ui');
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ['modules/aluno/cursos/eadAssessmentRevision.ui.fixture.tsx'],
  outfile: join(directory, 'smoke.js'), bundle: true, format: 'esm', platform: 'browser',
  plugins: [{ name: 'synthetic-rpc-only', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'smoke' }));
    builder.onLoad({ filter: /.*/, namespace: 'smoke' }, () => ({
      contents: 'export const supabase = { rpc: (...args) => window.__revisionSmokeRpc(...args) };',
    }));
  } }],
});
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Revisão EAD — smoke local</title>
<style>body{font-family:system-ui;color:#132b46;background:#f1f5f9;margin:0}main{max-width:1050px;margin:32px auto;background:white;padding:28px;border-radius:20px}button{margin:8px;padding:12px;border-radius:9px;border:1px solid #b7c6d8;cursor:pointer}button:disabled{opacity:.45;cursor:default}section{padding:18px;border:1px solid #bdcee4;border-radius:12px;margin-top:20px}label{display:block;padding:12px}p,li{line-height:1.8}h2,h3{margin-top:28px}a{color:#1d4ed8}details{padding:12px}table{border-collapse:collapse}td,th{border:1px solid #bac8db;padding:8px}@media(max-width:600px){main{margin:0;padding:16px}button{margin:6px 0;max-width:100%}}</style>
<div id="root"></div><script type="module" src="/smoke.js"></script></html>`;
await writeFile(join(directory, 'index.html'), html);
createServer(async (req, res) => {
  const file = req.url === '/smoke.js' ? 'smoke.js' : 'index.html';
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
    res.end(await readFile(join(directory, file)));
  } catch { res.writeHead(500); res.end('Falha no smoke local.'); }
}).listen(5817, '127.0.0.1', () => console.log(`Smoke EAD: http://127.0.0.1:5817 · artefatos em ${resolve(directory)}`));
