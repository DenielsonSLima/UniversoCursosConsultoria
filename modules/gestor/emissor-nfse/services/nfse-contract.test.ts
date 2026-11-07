import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import { createNfseService } from './nfse.service-core';
import { NfseContractError, NfseUnavailableError } from './nfse.errors';
import { money, unwrapNfseEnvelope } from './nfse.validation';
import { mapNfseConfiguration, mapNfseDocument, mapNfsePage } from './nfse.mappers';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import { nfseRealtimeTargets } from '../realtime/nfse.realtime';
import { nfseApi } from '../api/nfse-api';
import { getNfseCurrentMonth, isNfseScopeValid } from '../types/nfse.scope';

const scope: NfseScope = {
  poloId: '00000000-0000-0000-0000-000000000001', contextKey: 'synthetic-session-a',
  environment: 'HOMOLOGACAO', month: '2026-11',
};
const requestId = '00000000-0000-0000-0000-000000000002';
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('local stage rejects reads, writes and dispatch without invoking any transport', async () => {
  let calls = 0;
  const service = createNfseService(async () => { calls += 1; return null; });
  await assert.rejects(service.workspace(scope), NfseUnavailableError);
  await assert.rejects(service.prepare(scope, { requestId, candidateIds: ['candidate-a'], modelId: 'model-a' }, true), NfseUnavailableError);
  await assert.rejects(nfseApi.dispatch({ requestId, batchId: 'batch-a', poloId: scope.poloId, environment: scope.environment }), NfseUnavailableError);
  await assert.rejects(nfseApi.reconcile('document-a'), NfseUnavailableError);
  assert.equal(calls, 0);
});

test('envelope refuses another polo, identity context, month, environment and version', () => {
  for (const mismatch of [
    { poloId: '00000000-0000-0000-0000-000000000003' }, { contextKey: 'synthetic-session-b' },
    { environment: 'PRODUCAO' as const }, { month: '2026-10' },
  ]) assert.throws(() => unwrapNfseEnvelope(envelope({}, { ...scope, ...mismatch }), scope), NfseContractError);
  assert.throws(() => unwrapNfseEnvelope({ ...envelope({}), version: 2 }, scope), NfseContractError);
  assert.deepEqual(unwrapNfseEnvelope(envelope({ ok: true }), scope), { ok: true });
});

test('amounts retain exact decimal strings and unknowns; floating/scientific/malformed values fail closed', () => {
  assert.equal(money('9007199254740993.07'), '9007199254740993.07');
  assert.equal(money(null), null);
  assert.equal(money('0.00'), '0.00');
  for (const value of [undefined, 12.1, '', '1e3', '1,00', '01.00', '1.001', '1', '-1.00', Infinity]) {
    assert.throws(() => money(value), NfseContractError);
  }
});

const document = {
  id: 'document-a', studentName: 'Pessoa de teste', classLabel: 'Turma de teste', amount: '10.00',
  modelLabel: 'Modelo de teste', status: 'EMITIDA', number: '1', accessKey: 'synthetic-key',
  errorCode: null, errorMessage: null, retryable: false,
};

test('authorized documents require fiscal identification; uncertain outcome cannot be blindly retried', () => {
  assert.equal(mapNfseDocument(document).status, 'EMITIDA');
  assert.throws(() => mapNfseDocument({ ...document, accessKey: null }), NfseContractError);
  assert.throws(() => mapNfseDocument({ ...document, status: 'AGUARDANDO_CONFIRMACAO', retryable: true }), NfseContractError);
  assert.throws(() => mapNfseDocument({ ...document, amount: null }), NfseContractError);
});

test('page identity and duplicate document IDs are validated', () => {
  const payload = { rows: [document], page: 1, pageSize: 25, totalItems: 1 };
  assert.throws(() => mapNfsePage(payload, mapNfseDocument, 2), NfseContractError);
  assert.throws(() => mapNfsePage({ ...payload, totalItems: 2, rows: [document, document] }, mapNfseDocument, 1), NfseContractError);
});

test('configuration projection never retains unexpected credential material', () => {
  const config = mapNfseConfiguration({
    poloId: scope.poloId, cnpj: 'synthetic-cnpj', municipalityCode: null, municipalRegistration: null,
    portalAccess: 'CERTIFICATE', credentialSource: 'MATRIZ', environment: scope.environment,
    certificate: { configured: false, subject: null, expiresAt: null, privateKey: 'synthetic-secret' },
    portalLoginConfigured: false, readiness: { status: 'BLOCKED', message: 'Em preparação' },
    canManage: false, password: 'synthetic-secret',
  });
  assert.equal('password' in config, false);
  assert.equal('privateKey' in config.certificate, false);
});

test('preparation sends selected identities, never client financial amounts', async () => {
  let sent: Record<string, unknown> | undefined;
  const service = createNfseService(async (_name, args) => {
    sent = args;
    return envelope({ id: 'batch-a', version: 1, message: 'Preparado' });
  }, { reads: true, writes: true });
  await service.prepare(scope, { requestId, candidateIds: ['candidate-a'], modelId: 'model-a', amount: '0.01' } as never, true);
  assert.deepEqual(sent?.p_candidate_ids, ['candidate-a']);
  assert.equal('amount' in sent!, false);
  assert.equal('p_amount' in sent!, false);
  await assert.rejects(service.prepare(scope, { requestId, candidateIds: ['candidate-a', 'candidate-a'], modelId: 'model-a' }, true), NfseContractError);
});

test('cache and realtime are isolated by context, polo, month, environment and resource', () => {
  assert.notDeepEqual(nfseQueryKeys.workspace(scope), nfseQueryKeys.workspace({ ...scope, contextKey: 'other-session' }));
  const event = { new: { version: 1, polo_id: scope.poloId, environment: scope.environment, month: scope.month, resource: 'documents' } };
  assert.equal(nfseRealtimeTargets(event, scope).length, 2);
  for (const changed of [{ polo_id: 'other-polo' }, { environment: 'PRODUCAO' }, { month: '2026-10' }, { resource: 'unknown' }]) {
    assert.deepEqual(nfseRealtimeTargets({ new: { ...event.new, ...changed } }, scope), []);
  }
  assert.deepEqual(nfseRealtimeTargets({}, scope), []);
});

test('month defaults follow Maceio at UTC month boundaries and incomplete scopes are disabled', () => {
  assert.equal(getNfseCurrentMonth(new Date('2026-11-01T01:30:00Z')), '2026-10');
  assert.equal(getNfseCurrentMonth(new Date('2026-11-01T03:00:00Z')), '2026-11');
  assert.equal(isNfseScopeValid({ ...scope, contextKey: '' }), false);
  assert.equal(isNfseScopeValid({ ...scope, poloId: 'todos' }), false);
});
