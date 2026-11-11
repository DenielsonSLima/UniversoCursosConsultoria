import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseErrorArchiveService, createNfseErrorArchiveAttempt, canChangeNfseErrorArchive } from './nfse-error-archive.contract';
import { createNfseService } from '../services/nfse.service-core';
import { NfseContractError } from '../services/nfse.errors';
import { mapNfseDocument } from '../services/nfse.mappers';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import type { NfseScope } from '../types/nfse.types';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const input = { requestId: id(3), operationIds: [id(5), id(4)], action: 'ARCHIVE' as const };
const row = { id: id(4), studentName: 'PESSOA SINTÉTICA', classLabel: 'Serviço', amount: '1.00', modelLabel: 'MODELO',
  status: 'ERRO', state: 'REJECTED', number: null, accessKey: null, errorCode: 'E0120', errorMessage: 'Rejeição sintética.', retryable: false,
  archivedAt: null, canArchive: true, canRestore: false };

test('archive/restoration sends only captured scoped IDs and rejects crossed/partial responses', async () => {
  const service = createNfseErrorArchiveService(async (name, args) => {
    assert.equal(name, 'archive_nfse_errors_secure');
    assert.deepEqual(args, { p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment, p_month: scope.month,
      p_request_id: id(3), p_operation_ids: [id(4), id(5)], p_action: 'ARCHIVE' });
    return { version: 1, scope, data: { action: 'ARCHIVE', operationIds: [id(4), id(5)], changedCount: 2 } };
  });
  assert.equal((await service(scope, input)).changedCount, 2);
  for (const data of [{ action: 'RESTORE', operationIds: input.operationIds, changedCount: 2 },
    { action: 'ARCHIVE', operationIds: [id(4)], changedCount: 1 }, { action: 'ARCHIVE', operationIds: input.operationIds, changedCount: 3 }]) {
    await assert.rejects(createNfseErrorArchiveService(async () => ({ version: 1, scope, data }))(scope, input), NfseContractError);
  }
  await assert.rejects(createNfseErrorArchiveService(async () => ({ version: 1, scope: { ...scope, poloId: id(9) }, data: {} }))(scope, input), NfseContractError);
});

test('malformed IDs/actions fail before transport; failed same intent replays but confirmed or new scope creates a new request', async () => {
  let calls = 0, next = 20;
  const service = createNfseErrorArchiveService(async () => { calls++; return null; });
  for (const patch of [{ operationIds: [] }, { operationIds: [id(4), id(4)] }, { operationIds: ['bad'] }, { action: 'DELETE' }, { requestId: 'bad' }]) {
    await assert.rejects(service(scope, { ...input, ...patch } as never), NfseContractError);
  }
  assert.equal(calls, 0);
  const attempt = createNfseErrorArchiveAttempt(() => id(next++));
  const first = attempt.get(scope, 'ARCHIVE', [id(4), id(5)]);
  assert.deepEqual(attempt.get(scope, 'ARCHIVE', [id(5), id(4)]), first);
  assert.notEqual(attempt.get({ ...scope, poloId: id(9) }, 'ARCHIVE', first.operationIds).requestId, first.requestId);
  const current = attempt.get(scope, 'RESTORE', first.operationIds); attempt.confirm(current.requestId);
  assert.notEqual(attempt.get(scope, 'RESTORE', first.operationIds).requestId, current.requestId);
});

test('only authoritative terminal rejection flags allow actions; archived filter is sent before server paging', async () => {
  const parsed = mapNfseDocument(row);
  assert(canChangeNfseErrorArchive(parsed, 'ARCHIVE')); assert(!canChangeNfseErrorArchive(parsed, 'RESTORE'));
  for (const state of ['PROCESSING', 'AWAITING_CONFIRMATION', 'AUTHORIZED', 'CANCELLED', 'BLOCKED']) {
    assert(!canChangeNfseErrorArchive({ ...parsed, state }, 'ARCHIVE'));
    assert.throws(() => mapNfseDocument({ ...row, state }), NfseContractError);
  }
  const archived = { ...row, archivedAt: '2026-11-11T00:00:00Z', canArchive: false, canRestore: true };
  assert(canChangeNfseErrorArchive(mapNfseDocument(archived), 'RESTORE'));
  const service = createNfseService(async (_name, args) => {
    assert.equal(args.p_error_archive_mode, 'ARCHIVED'); assert.equal(args.p_page, 2);
    return { version: 1, scope, data: { rows: [archived], page: 2, pageSize: 25, totalItems: 26 } };
  }, { reads: true, writes: false });
  assert.equal((await service.documents(scope, { status: 'ERRO', errorArchiveMode: 'ARCHIVED', page: 2 })).totalItems, 26);
  assert.notDeepEqual(nfseQueryKeys.documents(scope, { status: 'ERRO', errorArchiveMode: 'ACTIVE' }), nfseQueryKeys.documents(scope, { status: 'ERRO', errorArchiveMode: 'ARCHIVED' }));
  await assert.rejects(service.documents(scope, { status: 'EMITIDA', errorArchiveMode: 'ARCHIVED' }), NfseContractError);
});
