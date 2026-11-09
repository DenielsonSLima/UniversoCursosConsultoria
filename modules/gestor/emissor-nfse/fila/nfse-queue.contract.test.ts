import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseQueueService } from './nfse-queue.service-core';
import { createNfsePreparationAttempt } from './nfse-preparation-attempt';
import { parseQueuePage, parseQueueSaved } from './nfse-queue.contract';
import { nfseQueueKeys, type NfseQueueInput } from './nfse-queue.types';
import { NfseContractError } from '../services/nfse.errors';
import type { NfseScope } from '../types/nfse.types';

const id = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const input: NfseQueueInput = { requestId: id(3), candidateIds: [`${id(4)}:${id(5)}`],
  modelId: id(6), modelVersion: 2, paymentMonth: '2026-10' };
const saved = { id: id(7), version: 1, documentCount: 1, receiptCount: 2,
  totalAmount: '987654321012345.67', documentIds: [id(8)], message: 'Preparação confirmada.' };
const row = { id: id(8), batchId: id(7), studentId: id(5), studentName: 'Aluno sintético',
  classId: id(4), classLabel: 'Turma sintética', amount: saved.totalAmount, modelLabel: 'Serviço',
  status: 'PREPARADO', receiptCount: 2, paymentMonth: '2026-10', createdAt: '2026-11-08T12:00:00Z',
  blockingReasons: ['Confirmar competência fiscal.'] };
const page = { rows: [row], page: 1, pageSize: 25, totalItems: 1, totalAmount: saved.totalAmount,
  summary: { preparedCount: 1, preparedAmount: saved.totalAmount }, providerEnabled: false };
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('queue sends only intent and keeps payment month separate from queue month', async () => {
  const service = createNfseQueueService(async (name, args) => {
    assert.equal(name, 'prepare_nfse_batch_secure');
    assert.deepEqual(args, { p_context_key: id(1), p_polo_id: id(2), p_environment: 'HOMOLOGACAO',
      p_month: '2026-11', p_request_id: id(3), p_candidate_ids: input.candidateIds,
      p_model_id: id(6), p_model_version: 2, p_payment_month: '2026-10' });
    return envelope({ ...saved, privateKey: 'must not survive projection' });
  });
  assert.deepEqual(await service.prepare(scope, { ...input, totalAmount: '0.01', issue: true } as NfseQueueInput), saved);
});

test('untrusted queue results cannot cross polo/context/environment/month boundaries', async () => {
  for (const changed of [{ poloId: id(99) }, { contextKey: id(99) }, { month: '2026-10' }, { environment: 'PRODUCAO' as const }]) {
    const service = createNfseQueueService(async () => envelope(page, { ...scope, ...changed }));
    await assert.rejects(service.list(scope, 1), NfseContractError);
    assert.notDeepEqual(nfseQueueKeys.scope(scope), nfseQueueKeys.scope({ ...scope, ...changed }));
  }
});

test('invalid or duplicated candidate selections never reach the network', async () => {
  let calls = 0;
  const service = createNfseQueueService(async () => { calls++; return envelope(saved); });
  for (const patch of [{ candidateIds: [] }, { candidateIds: [id(4)] },
    { candidateIds: [input.candidateIds[0], input.candidateIds[0]] }, { paymentMonth: '2026-13' },
    { modelVersion: 0 }, { modelId: 'todos' }, { requestId: '' }]) {
    await assert.rejects(service.prepare(scope, { ...input, ...patch }), NfseContractError);
  }
  assert.equal(calls, 0);
});

test('queue preserves exact server decimals and rejects malformed fiscal states or duplicates', () => {
  assert.equal(parseQueuePage(page, 1).totalAmount, saved.totalAmount);
  assert.equal(parseQueuePage(page, 1).rows[0].amount, saved.totalAmount);
  for (const changed of [{ providerEnabled: true }, { page: 2 }, { totalAmount: null },
    { rows: [{ ...row, status: 'EMITIDA' }] }, { rows: [row, row], totalItems: 2 },
    { rows: [{ ...row, amount: 100 }] }]) {
    assert.throws(() => parseQueuePage({ ...page, ...changed }, 1), NfseContractError);
  }
  assert.throws(() => parseQueueSaved({ ...saved, documentIds: [] }), NfseContractError);
  assert.throws(() => parseQueueSaved({ ...saved, receiptCount: 0 }), NfseContractError);
});

test('lost responses reuse the request and changed model, month or scope gets a new intent', () => {
  let next = 20;
  const attempt = createNfsePreparationAttempt(() => id(next++));
  const { requestId: _requestId, ...intent } = input;
  const first = attempt(scope, intent);
  assert.deepEqual(attempt(scope, intent), first);
  first.candidateIds.push(`${id(9)}:${id(10)}`);
  assert.deepEqual(attempt(scope, intent).candidateIds, input.candidateIds);
  assert.notEqual(attempt(scope, { ...intent, modelVersion: 3 }).requestId, first.requestId);
  assert.notEqual(attempt({ ...scope, poloId: id(99) }, intent).requestId, first.requestId);
  assert.notEqual(attempt(scope, { ...intent, paymentMonth: '2026-09' }).requestId, first.requestId);
});

test('failed preparation cannot be turned into a successful local document', async () => {
  const failure = new Error('Não confirmado');
  const service = createNfseQueueService(async () => { throw failure; });
  await assert.rejects(service.prepare(scope, input), error => error === failure);
});

test('only a confirmed response closes the attempt; late confirmation preserves a different intent', () => {
  let next = 20;
  const attempt = createNfsePreparationAttempt(() => id(next++));
  const { requestId: _requestId, ...intent } = input;
  const first = attempt(scope, intent);
  assert.equal(attempt(scope, intent).requestId, first.requestId);
  attempt.confirm(first.requestId);
  const second = attempt(scope, intent);
  assert.notEqual(second.requestId, first.requestId);
  attempt.confirm(first.requestId);
  assert.equal(attempt(scope, intent).requestId, second.requestId);
});

test('numeric(30,2) queue totals keep all 28 integer digits without Number conversion', () => {
  const totalAmount = '9876543210987654321098765432.10';
  assert.equal(parseQueueSaved({ ...saved, totalAmount }).totalAmount, totalAmount);
  assert.equal(parseQueuePage({ ...page, totalAmount, summary: { ...page.summary, preparedAmount: totalAmount } }, 1).totalAmount, totalAmount);
  assert.throws(() => parseQueueSaved({ ...saved, totalAmount: `${totalAmount}0` }), NfseContractError);
});
