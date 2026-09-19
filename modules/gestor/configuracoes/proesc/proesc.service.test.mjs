import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./proesc.service.ts', import.meta.url), 'utf8');

function setup(response = { data: { configured: true }, error: null }) {
  const calls = [];
  const supabase = { functions: { invoke: async (name, options) => {
    calls.push({ name, ...options });
    return response;
  } } };
  const exports = {};
  const { outputText } = ts.transpileModule(source.replace(/^import \{ supabase \}[^\n]*\n/, ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  new Function('supabase', 'exports', outputText)(supabase, exports);
  return { ...exports, calls };
}

test('cada ação envia a versão selecionada sem fallback', async () => {
  const { proescService: service, calls } = setup();
  for (const version of ['v1', 'v2']) {
    await service.connectionStatus(version);
    await service.saveConnection(version, 'synthetic-token');
    await service.testConnection(version);
    await service.removeConnection(version);
  }
  assert.deepEqual(calls.map(({ body }) => body), ['v1', 'v2'].flatMap((version) => [
    { action: 'connection_status', version },
    { action: 'save_connection', version, token: 'synthetic-token' },
    { action: 'test_connection', version },
    { action: 'remove_connection', version },
  ]));
  assert.ok(calls.every(({ name }) => name === 'proesc-api'));
});

test('WAF é enviado só na V2 e vazio preserva o valor remoto', async () => {
  const { proescService: service, calls } = setup();
  await service.saveConnection('v1', 'synthetic-token', 'synthetic-waf');
  await service.saveConnection('v2', 'synthetic-token', '   ');
  await service.saveConnection('v2', 'synthetic-token', ' synthetic-waf ');
  assert.equal(Object.hasOwn(calls[0].body, 'wafHeader'), false);
  assert.equal(Object.hasOwn(calls[1].body, 'wafHeader'), false);
  assert.equal(calls[2].body.wafHeader, 'synthetic-waf');
});

test('cache de configuração separa versões e não contém credenciais', () => {
  const { proescKeys: keys } = setup();
  assert.notDeepEqual(keys.connection('v1'), keys.connection('v2'));
  assert.deepEqual(keys.connection('v1'), ['configuracoes', 'proesc', 'connection', 'v1']);
  assert.deepEqual(keys.connection('v2'), ['configuracoes', 'proesc', 'connection', 'v2']);
});

test('erro de acesso V2 não dispara tentativa V1', async () => {
  const { proescService: service, calls } = setup({ data: null, error: {
    context: new Response(JSON.stringify({ error: 'Acesso V2 recusado.' }), { status: 403 }),
  } });
  await assert.rejects(service.testConnection('v2'), /Acesso V2 recusado/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.version, 'v2');
});
