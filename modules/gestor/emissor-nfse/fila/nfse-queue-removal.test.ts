import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseQueueService } from './nfse-queue.service-core';
import { createNfseQueueRemovalAttempt, parseQueueRemoval, queueRemovalInput } from './nfse-queue-removal';
import { isNfseQueueEvent } from './nfse-queue.realtime';
import { NfseContractError } from '../services/nfse.errors';
import type { NfseScope } from '../types/nfse.types';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const input = { requestId: id(3), documentIds: [id(6), id(5)] };
const saved = { id: id(7), documentIds: [id(5), id(6)], removedCount: 2, paymentMonths: ['2026-10'], message: 'Excluídas.' };
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('removal sends only exact intent with sorted IDs and verifies the whole confirmed batch', async () => {
  const service = createNfseQueueService(async (name, args) => {
    assert.equal(name, 'remove_nfse_queue_documents_secure');
    assert.deepEqual(args, { p_context_key: id(1), p_polo_id: id(2), p_environment: 'HOMOLOGACAO',
      p_month: '2026-11', p_request_id: id(3), p_document_ids: [id(5), id(6)] });
    return envelope({ ...saved, snapshot: 'not projected' });
  });
  assert.deepEqual(await service.remove(scope, input), saved);
});

test('empty, duplicated or oversized selections never reach the network', async () => {
  let calls = 0;
  const service = createNfseQueueService(async () => { calls++; return envelope(saved); });
  for (const documentIds of [[], [id(5), id(5)], ['invalid'], Array.from({ length: 101 }, (_, n) => id(n))]) {
    await assert.rejects(service.remove(scope, { ...input, documentIds }), NfseContractError);
  }
  assert.throws(() => queueRemovalInput({ ...input, requestId: '' }), NfseContractError);
  assert.equal(calls, 0);
});

test('partial, foreign, duplicated or malformed responses never become successful deletion', () => {
  for (const patch of [{ removedCount: 1 }, { documentIds: [id(5)] }, { documentIds: [id(5), id(8)] },
    { documentIds: [id(5), id(5)] }, { paymentMonths: [] }, { paymentMonths: ['2026-13'] },
    { paymentMonths: ['2026-10', '2026-10'] }]) {
    assert.throws(() => parseQueueRemoval({ ...saved, ...patch }, input.documentIds), NfseContractError);
  }
});

test('removal rejects mismatched scope or an unconfirmed network failure', async () => {
  for (const patch of [{ contextKey: id(8) }, { poloId: id(8) }, { month: '2026-10' }, { environment: 'PRODUCAO' as const }]) {
    const service = createNfseQueueService(async () => envelope(saved, { ...scope, ...patch }));
    await assert.rejects(service.remove(scope, input), NfseContractError);
  }
  const failure = new Error('Resposta perdida');
  await assert.rejects(createNfseQueueService(async () => { throw failure; }).remove(scope, input), error => error === failure);
});

test('repeated confirmation reuses request ID; selection or scope changes start another intent', () => {
  let next = 50;
  const attempt = createNfseQueueRemovalAttempt(() => id(next++));
  const first = attempt(scope, input.documentIds);
  assert.deepEqual(attempt(scope, [...input.documentIds].reverse()), first);
  first.documentIds.push(id(99));
  assert.equal(attempt(scope, input.documentIds).documentIds.length, 2);
  assert.notEqual(attempt({ ...scope, poloId: id(9) }, input.documentIds).requestId, first.requestId);
  assert.notEqual(attempt(scope, [id(5)]).requestId, first.requestId);
});

test('realtime ignores other polo, month, environment and malformed events', () => {
  const event = { version: 1, polo_id: scope.poloId, environment: scope.environment, month: scope.month };
  assert.equal(isNfseQueueEvent({ new: event }, scope), true);
  for (const patch of [{ version: 2 }, { polo_id: id(9) }, { environment: 'PRODUCAO' }, { month: '2026-10' }]) {
    assert.equal(isNfseQueueEvent({ new: { ...event, ...patch } }, scope), false);
  }
  for (const payload of [null, {}, { new: null }, { old: event }]) assert.equal(isNfseQueueEvent(payload, scope), false);
});
