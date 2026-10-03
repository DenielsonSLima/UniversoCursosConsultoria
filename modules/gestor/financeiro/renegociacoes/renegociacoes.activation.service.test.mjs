import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), 'universo-activation-service-'));
const bundle = join(temporary, 'service.cjs');
after(async () => { await rm(temporary, { recursive: true, force: true }); });
await build({
  entryPoints: [fileURLToPath(new URL('./renegociacoes.activation.service.ts', import.meta.url))],
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'synthetic-transport', setup(api) {
    api.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const supabase={
        functions:{invoke:(...args)=>globalThis.__activationTransport.invoke(...args)},
        rpc:(...args)=>({abortSignal:(signal)=>globalThis.__activationTransport.rpc(...args,signal)}),
      };
    ` }));
  } }],
});
const { renegociacaoActivationService: service } = require(bundle);
const input = { agreementId: 'agreement-1', requestId: 'request-1', expectedVersion: 2,
  expectedFingerprint: 'fingerprint', confirm: true, approveCustomTerms: false };
const partial = { agreementId: 'agreement-1', operationId: 'operation-1', requestId: 'request-1',
  state: 'CANCELING_SOURCES', sourcesTotal: 3, sourcesCanceled: 1, replacementsTotal: 2, replacementsIssued: 0,
  retryable: true, success: false, code: null, message: 'Cancelamento em andamento.' };

test('serviço aceita progresso 202 e revisão 409 estruturada, sem promover resultado parcial a sucesso', async () => {
  const previous = globalThis.__activationTransport;
  const calls = [];
  let transportResult = { data: partial, error: null };
  globalThis.__activationTransport = { invoke: async (...args) => { calls.push(args); return transportResult; } };
  try {
    assert.equal((await service.activate(input)).state, 'CANCELING_SOURCES');
    assert.deepEqual(calls[0], ['receivable-renegotiation-activate', { body: input }]);
    await service.activate({ ...input, approveCustomTerms: true });
    assert.equal(calls[1][1].body.approveCustomTerms, true, 'transporte preserva aprovação explícita sem reconstruir payload');
    const review = { ...partial, state: 'REVIEW_REQUIRED', retryable: false, code: 'BANK_REVIEW', message: 'Conferência necessária.' };
    transportResult = { data: null, error: { context: new Response(JSON.stringify(review), { status: 409 }) } };
    assert.equal((await service.activate(input)).state, 'REVIEW_REQUIRED');
    transportResult = { data: null, error: { context: new Response(JSON.stringify({ error: 'Forbidden', code: '42501' }), { status: 409 }) } };
    await assert.rejects(service.activate(input), /não pertence/);
    const network = new Error('Failed to fetch');
    transportResult = { data: null, error: network };
    await assert.rejects(service.activate(input), (error) => error === network);
    assert.equal(calls.length, 5, 'o serviço nunca repete POST automaticamente');
  } finally { if (previous === undefined) delete globalThis.__activationTransport; else globalThis.__activationTransport = previous; }
});

test('consulta retorna null apenas com ausência comprovada e recupera CAS original sem operação bancária', async () => {
  const previous = globalThis.__activationTransport;
  const calls = [];
  let result = { data: null, error: null };
  globalThis.__activationTransport = { rpc: async (...args) => { calls.push(args); return result; } };
  try {
    assert.equal(await service.get('agreement-1'), null);
    assert.equal(calls[0][0], 'get_receivable_renegotiation_activation_secure');
    assert.deepEqual(calls[0][1], { p_agreement_id: 'agreement-1' });
    result = { data: { ...partial, approvedCustomTerms: true, expectedVersion: 2, expectedFingerprint: 'fingerprint', agreementVersion: 5,
      proposalFingerprint: 'fingerprint', createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:01:00Z', completedAt: null }, error: null };
    const operation = await service.get('agreement-1');
    assert.equal(operation.expectedVersion, 2);
    assert.equal(operation.agreementVersion, 5);
    assert.equal(operation.approvedCustomTerms, true);
    result = { data: undefined, error: null };
    await assert.rejects(service.get('agreement-1'), /aprovação original/);
    const unavailable = { message: 'permission denied', code: '42501' };
    result = { data: null, error: unavailable };
    await assert.rejects(service.get('agreement-1'), (error) => error === unavailable);
  } finally { if (previous === undefined) delete globalThis.__activationTransport; else globalThis.__activationTransport = previous; }
});
