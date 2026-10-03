import assert from 'node:assert/strict';
import test from 'node:test';
import { runActivationSequence } from './renegociacoes.activation-sequence.ts';
import type { ActivateRenegociacaoInput, RenegociacaoActivationResult } from './renegociacoes.activation.ts';

const input: ActivateRenegociacaoInput = { agreementId: 'agreement', requestId: 'request', expectedVersion: 2,
  expectedFingerprint: 'fingerprint', confirm: true, approveCustomTerms: false };
const first: RenegociacaoActivationResult = { ...input, operationId: 'operation', state: 'CANCELING_SOURCES',
  sourcesTotal: 3, sourcesCanceled: 1, replacementsTotal: 2, replacementsIssued: 0,
  retryable: true, success: false, code: null, message: 'Em andamento' };

test('202→202→ACTIVE continua automaticamente com o mesmo payload e para no final', async () => {
  const responses = [first, { ...first, state: 'ISSUING_REPLACEMENTS' as const, sourcesCanceled: 3, replacementsIssued: 1 },
    { ...first, state: 'ACTIVE' as const, sourcesCanceled: 3, replacementsIssued: 2, success: true, retryable: false }];
  const calls: ActivateRenegociacaoInput[] = [];
  const progress: string[] = [];
  const result = await runActivationSequence({ input,
    invoke: async (payload) => { calls.push(payload); return responses[calls.length - 1]; },
    onProgress: (item) => progress.push(item.state), shouldContinue: () => true });
  assert.equal(result?.state, 'ACTIVE');
  assert.deepEqual(calls, [input, input, input]);
  assert.ok(calls.every((payload) => payload === input), 'nenhuma chave, CAS ou aprovação é recriada');
  assert.deepEqual(progress, ['CANCELING_SOURCES', 'ISSUING_REPLACEMENTS', 'ACTIVE']);
});

test('timeout, code de erro, ausência de avanço, limite e desmontagem interrompem sem retry cego', async () => {
  for (const response of [{ ...first, code: 'BANK_TIMEOUT' }, { ...first, state: 'REVIEW_REQUIRED' as const, retryable: false }]) {
    let calls = 0;
    await runActivationSequence({ input, invoke: async () => { calls += 1; return response; }, onProgress: () => {}, shouldContinue: () => true });
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(runActivationSequence({ input, invoke: async () => { calls += 1; throw new Error('timeout'); },
    onProgress: () => {}, shouldContinue: () => true }), /timeout/);
  assert.equal(calls, 1);
  calls = 0;
  await runActivationSequence({ input, invoke: async () => { calls += 1; return first; },
    onProgress: () => {}, shouldContinue: () => true });
  assert.equal(calls, 2, 'resposta sem progresso não entra em loop');
  calls = 0;
  await runActivationSequence({ input, invoke: async () => { calls += 1; return first; },
    onProgress: () => {}, shouldContinue: () => true, maxRounds: 1 });
  assert.equal(calls, 1);
  let mounted = true;
  calls = 0;
  await runActivationSequence({ input, invoke: async () => { calls += 1; return first; },
    onProgress: () => { mounted = false; }, shouldContinue: () => mounted });
  assert.equal(calls, 1);
});
