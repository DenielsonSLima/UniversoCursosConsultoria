import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const stubs = {
  supabase: 'export const createClient = () => globalThis.__lgpdRoute.admin;',
  authz: `export const requireGestorAtivo = async () => ({ id: 'synthetic-manager' });
    export const requireGestorTab = () => {};
    export const requireGestorForWhatsAppRoute = () => {};`,
  http: `export const buildCorsHeaders = () => ({});
    export const getClientIp = () => 'synthetic-ip';
    export const isRateLimitExceeded = () => false;
    export const json = (body,status=200) => Response.json(body,{status});`,
  whatsapp: `export const insertWhatsAppMessage = () => { throw new Error('unexpected write'); };
    export const normalizeWhatsAppPhone = value => value;
    export const phoneBelongsToAluno = async () => false;
    export const upsertWhatsAppConversation = () => { throw new Error('unexpected write'); };`,
  'whatsapp-connection': 'export const getWhatsAppMetaContext = (...args) => globalThis.__lgpdRoute.context(...args);',
};
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external',
  plugins: [{ name: 'isolated-route-boundaries', setup(builder) {
    builder.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: 'supabase', namespace: 'route-test' }));
    builder.onResolve({ filter: /_shared\/(authz|http|whatsapp|whatsapp-connection)\.ts$/ }, ({ path }) => ({
      path: path.split('/').at(-1).replace('.ts', ''), namespace: 'route-test',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'route-test' }, ({ path }) => ({ contents: stubs[path] }));
  } }],
});

test('handler bloqueia transcrição antiga antes de consulta e não vaza falha anterior ao download', async () => {
  const previousDeno = globalThis.Deno;
  let handler, reads = 0, contexts = 0;
  const environment = {
    SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
    WHATSAPP_TRANSCRIPTION_ENABLED: 'false',
    WHATSAPP_TRANSCRIPTION_APPROVAL_REFERENCE: 'synthetic-approval',
  };
  globalThis.Deno = { env: { get: name => environment[name] }, serve: fn => { handler = fn; } };
  globalThis.__lgpdRoute = {
    admin: { from: () => {
      reads++;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: 'synthetic-message', message_type: 'audio', raw_payload: {},
        whatsapp_conversas: { conexao_id: 'synthetic-line', setor: 'atendimento_geral', polo_id: 'synthetic-polo' },
      }, error: null }) }) }) };
    } },
    context: () => { contexts++; throw new Error('synthetic-private-config-detail'); },
  };
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...values) => logged.push(values);
  try {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
    const invoke = body => handler(new Request('https://synthetic.invalid/whatsapp-media', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    let response = await invoke({ action: 'transcribe', messageId: 'synthetic-message' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'transcription_disabled');
    assert.equal(reads, 0);
    assert.equal(contexts, 0);

    environment.WHATSAPP_TRANSCRIPTION_ENABLED = 'true';
    for (const notice of [{}, { noticeAccepted: true, noticeVersion: 'old-notice' }]) {
      response = await invoke({ action: 'transcribe', messageId: 'synthetic-message', ...notice });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'transcription_notice_required');
    }
    assert.equal(reads, 0);
    assert.equal(contexts, 0);

    response = await invoke({ action: 'transcribe', messageId: 'synthetic-message',
      noticeAccepted: true, noticeVersion: 'whatsapp-transcription-privacy-v1' });
    assert.equal(reads, 1);
    assert.equal(contexts, 1);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, 'transcription_failed');
    assert.doesNotMatch(JSON.stringify(body), /private-config-detail/);
    assert.deepEqual(logged, []);
  } finally {
    console.error = originalConsoleError;
    if (previousDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = previousDeno;
    delete globalThis.__lgpdRoute;
  }
});
