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

test('cada ação operacional envia V2 sem fallback', async () => {
  const { proescService: service, calls } = setup();
  await service.connectionStatus('v2');
  await service.saveConnection('v2', 'synthetic-token');
  await service.testConnection('v2');
  await service.removeConnection('v2');
  assert.deepEqual(calls.map(({ body }) => body), [
    { action: 'connection_status', version: 'v2' },
    { action: 'save_connection', version: 'v2', token: 'synthetic-token' },
    { action: 'test_connection', version: 'v2' },
    { action: 'remove_connection', version: 'v2' },
  ]);
  assert.ok(calls.every(({ name }) => name === 'proesc-api'));
});

test('chamadas V1 antigas são recusadas antes de acessar a rede', async () => {
  const { proescService: service, calls } = setup();
  await assert.rejects(service.connectionStatus('v1'), /V1 foi encerrada/);
  await assert.rejects(service.saveConnection('v1', 'synthetic-token'), /V1 foi encerrada/);
  await assert.rejects(service.testConnection('v1'), /V1 foi encerrada/);
  await assert.rejects(service.removeConnection('v1'), /V1 foi encerrada/);
  assert.equal(calls.length, 0);
});

test('aliases de token também usam as ações versionadas V2', async () => {
  const { proescService: service, calls } = setup();
  await service.status();
  await service.saveToken('synthetic-token');
  await service.testToken();
  await service.removeToken();
  assert.deepEqual(calls.map(({ body }) => body), [
    { action: 'connection_status', version: 'v2' },
    { action: 'save_connection', version: 'v2', token: 'synthetic-token' },
    { action: 'test_connection', version: 'v2' },
    { action: 'remove_connection', version: 'v2' },
  ]);
});

test('WAF vazio preserva o valor remoto e preenchido é normalizado', async () => {
  const { proescService: service, calls } = setup();
  await service.saveConnection('v2', 'synthetic-token', '   ');
  await service.saveConnection('v2', 'synthetic-token', ' synthetic-waf ');
  assert.equal(Object.hasOwn(calls[0].body, 'wafHeader'), false);
  assert.equal(calls[1].body.wafHeader, 'synthetic-waf');
});

test('cache de configuração V2 não contém credenciais', () => {
  const { proescKeys: keys } = setup();
  assert.deepEqual(keys.connection('v2'), ['configuracoes', 'proesc', 'connection', 'v2']);
});

test('histórico de turmas mantém a consulta de registros existentes', async () => {
  const { proescService: service, calls } = setup();
  await service.classes(20);
  await service.events('synthetic-class', 40);
  assert.deepEqual(calls.map(({ body }) => body), [
    { action: 'class_history', offset: 20 },
    { action: 'class_events', classId: 'synthetic-class', offset: 40 },
  ]);
});

test('erro de acesso V2 não dispara tentativa V1', async () => {
  const { proescService: service, calls } = setup({ data: null, error: {
    context: new Response(JSON.stringify({ error: 'Acesso V2 recusado.' }), { status: 403 }),
  } });
  await assert.rejects(service.testConnection('v2'), /Acesso V2 recusado/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.version, 'v2');
});
