import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import { createNfseService } from './nfse.service-core';
import { mapNfseDocument } from './nfse.mappers';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import { NfseContractError } from './nfse.errors';
const scope: NfseScope = { poloId: '00000000-0000-0000-0000-000000000001', contextKey: 'synthetic-scope', environment: 'PRODUCAO', month: '2026-11' };
const row = { id: 'note-1', studentName: 'PARCEIRO SINTÉTICO', classLabel: 'Serviço sintético', modelLabel: 'MODELO SINTÉTICO', amount: '1.00', status: 'EMITIDA',
  number: '2', accessKey: '1'.repeat(50), errorCode: null, errorMessage: null, retryable: false, state: 'CANCELLED',
  emittedAt: '2026-11-11T00:00:00Z', dateSource: 'NFSE_DH_PROC', origin: 'SERVICO', courseType: null, courseTypeLabel: null };
const page = { rows: [row], page: 2, pageSize: 25, totalItems: 26, courseTypes: [{ value: 'TECNICO', label: 'Técnico' }] };
const filters = { status: 'EMITIDA' as const, search: 'nota', page: 2, dateFrom: '2026-11-01', dateTo: '2026-11-10', courseType: 'TECNICO', origin: 'SERVICO' as const };

test('issued filters and paging are sent to the scoped server; canonical course choices are not inferred from visible rows', async () => {
  const service = createNfseService(async (name, args) => {
    assert.equal(name, 'get_nfse_documents_secure');
    assert.deepEqual(args, { p_polo_id: scope.poloId, p_context_key: scope.contextKey, p_environment: scope.environment, p_month: scope.month,
      p_status: 'EMITIDA', p_search: 'nota', p_page: 2, p_page_size: 25, p_date_from: '2026-11-01', p_date_to: '2026-11-10', p_course_type: 'TECNICO', p_origin: 'SERVICO' });
    return { version: 1, scope, data: page };
  }, { reads: true, writes: false });
  const result = await service.documents(scope, filters);
  assert.equal(result.totalItems, 26); assert.equal(result.rows[0].state, 'CANCELLED');
  assert.deepEqual(result.courseTypes, page.courseTypes); assert.equal(result.rows[0].origin, 'SERVICO');
});

test('invalid date ranges and origin values never reach the fiscal list transport', async () => {
  let calls = 0; const service = createNfseService(async () => { calls++; return null; }, { reads: true, writes: false });
  for (const change of [{ dateFrom: '2026-02-30' }, { dateFrom: '0002-11-10' }, { dateFrom: '2200-01-01' }, { dateFrom: '2026-11-11' }, { dateTo: 'invalid' }, { origin: 'ANYTHING' }]) {
    await assert.rejects(service.documents(scope, { ...filters, ...change } as typeof filters), NfseContractError);
  }
  assert.equal(calls, 0);
});

test('date source stays tied to fiscal XML and all list filters isolate caches', () => {
  const parsed = mapNfseDocument(row); assert.equal(parsed.emittedAt, row.emittedAt); assert.equal(parsed.dateSource, 'NFSE_DH_PROC');
  assert.throws(() => mapNfseDocument({ ...row, dateSource: 'PREPARATION_CREATED_AT' }), NfseContractError);
  for (const change of [{ dateFrom: '2026-11-02' }, { dateTo: '2026-11-09' }, { courseType: 'OUTRO' }, { origin: 'ALUNO' as const }]) {
    assert.notDeepEqual(nfseQueryKeys.documents(scope, filters), nfseQueryKeys.documents(scope, { ...filters, ...change }));
  }
});
