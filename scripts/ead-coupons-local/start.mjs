import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createPreviewDatabase } from './preview-database.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const portArgument = process.argv.indexOf('--port');
const port = portArgument < 0 ? 4387 : Number(process.argv[portArgument + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta local inválida.');
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString('hex');
const database = await createPreviewDatabase();
const subscribers = new Set();
const bundle = await build({
  entryPoints: [resolve(directory, 'Preview.tsx')], outfile: resolve(directory, 'generated-preview.js'),
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': JSON.stringify({ DEV: true,
    VITE_EAD_COUPONS_ENABLED: 'true', VITE_SUPABASE_URL: origin }) },
  plugins: [{ name: 'isolated-coupon-transport', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: resolve(directory, 'transport.ts') }));
  } }],
});
const tailwind = await postcss([tailwindcss({
  content: [resolve(directory, 'Preview.tsx'),
    resolve(root, 'modules/aluno/cursos/components/EadCheckoutReviewModal.tsx'),
    resolve(root, 'modules/aluno/cursos/components/cupons/EadCouponField.tsx'),
    resolve(root, 'modules/gestor/components/ToastNotification.tsx'),
    resolve(root, 'modules/shared/components/InstitutionalSelect.tsx')],
})]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined });
const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = tailwind.css + '\n' + (bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '');
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cupons EAD · prévia local fictícia</title><link rel="stylesheet" href="/main.css"></head><body><div id="root"></div>
<script>window.__LOCAL_COUPONS_TOKEN__=${JSON.stringify(token)};</script><script defer src="/main.js"></script></body></html>`;
const send = (response, status, value, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': type });
  response.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
};
const readJson = async request => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65_536) throw new Error('Requisição local excedeu o limite.');
  }
  const parsed = JSON.parse(body || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Requisição inválida.');
  return parsed;
};
const broadcast = (table, values = {}) => {
  const message = `data: ${JSON.stringify({ table, new: { polo_id: database.ids.polo, ...values } })}\n\n`;
  for (const response of subscribers) response.write(message);
};
const changed = (identity, couponId) => {
  const aluno = /^student-[1-4]$/.test(identity) ? `00000000-0000-4000-8000-${identity.split('-')[1].padStart(12, '0')}` : undefined;
  broadcast('ead_coupons', { id: couponId });
  broadcast('ead_coupon_redemptions', { aluno_id: aluno, coupon_id: couponId });
  broadcast('ead_coupon_events', { coupon_id: couponId });
};
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self';connect-src 'self';img-src 'self' data:;style-src 'self' 'unsafe-inline';script-src 'self' 'unsafe-inline';frame-ancestors 'none'");
  if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin && request.headers.origin !== origin)
    || request.headers['sec-fetch-site'] === 'cross-site') return send(response, 403, { error: 'Esta prévia aceita somente a origem local.' });
  try {
    const url = new URL(request.url, origin);
    if (request.method === 'GET' && url.pathname === '/') return send(response, 200, html, 'text/html; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/main.js') return send(response, 200, javascript, 'text/javascript; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/main.css') return send(response, 200, css, 'text/css; charset=utf-8');
    if ((request.headers['x-local-coupons-token'] || url.searchParams.get('token')) !== token) return send(response, 403, { error: 'Sessão da prévia local inválida.' });
    if (request.method === 'GET' && url.pathname === '/api/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      response.write(': prévia local fictícia\n\n'); subscribers.add(response);
      request.on('close', () => subscribers.delete(response)); return;
    }
    const identity = request.headers['x-preview-identity'];
    if (typeof identity !== 'string' || !/^(manager|student-[1-4])$/.test(identity)) return send(response, 400, { error: 'Selecione uma identidade fictícia.' });
    if (request.method === 'GET' && url.pathname === '/api/state') return send(response, 200, await database.state(identity));
    if (request.method !== 'POST') return send(response, 404, { error: 'Rota local não encontrada.' });
    const body = await readJson(request);
    if (url.pathname === '/api/rpc') {
      const result = await database.call(identity, body.name, body.args);
      if (!result.error && body.name === 'ead_coupons_save') changed(identity, result.data.id);
      if (!result.error && body.name === 'ead_coupon_redeem_free') changed(identity, result.data.couponId);
      return send(response, 200, result);
    }
    if (url.pathname === '/api/checkout') {
      const result = await database.checkout(identity, body, origin);
      if (!result.error) changed(identity);
      return send(response, 200, result);
    }
    if (url.pathname === '/api/simulate-payment') {
      const result = await database.simulatePayment(identity, body.receivableId);
      changed(identity); return send(response, 200, result);
    }
    return send(response, 404, { error: 'Rota local não encontrada.' });
  } catch (error) { return send(response, 400, { error: error.message || 'Falha na prévia fictícia.' }); }
});
server.on('error', async error => { console.error(error.message); await database.close(); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`Prévia fictícia disponível em ${origin}`);
  console.log('Matriz fictícia: cupons LOCALGRATIS e LOCAL375 (37,5%). Banco descartável em memória. Ctrl+C encerra.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const subscriber of subscribers) subscriber.end();
  server.close(async () => { await database.close(); process.exit(0); });
  server.closeAllConnections();
});
