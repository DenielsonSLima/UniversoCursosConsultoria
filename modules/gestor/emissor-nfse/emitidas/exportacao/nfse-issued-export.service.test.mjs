import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const directory = await mkdtemp(join(tmpdir(), 'nfse-issued-report-'));
const output = join(directory, 'service.mjs');
await build({ entryPoints: [fileURLToPath(new URL('nfse-issued-export.service-core.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
const { createNfseIssuedExportService } = await import(pathToFileURL(output).href);
const scope = { poloId: '00000000-0000-4000-8000-000000000001', contextKey: 'synthetic-context', environment: 'PRODUCAO', month: '2026-11' };
const filters = { dateFrom: '2026-11-01', dateTo: '2026-11-30', search: '  TESTE  ', courseType: 'TECNICO', origin: 'ALUNO' };
const row = index => ({ id: `synthetic-${index}`, studentName: 'ALUNO SINTÉTICO', classLabel: 'TURMA SINTÉTICA', modelLabel: 'MODELO INTERNO',
  amount: '0.01', status: 'EMITIDA', state: 'AUTHORIZED', number: String(index + 1), accessKey: String(index + 1).padStart(50, '0'),
  errorCode: null, errorMessage: null, retryable: false, emittedAt: '2026-11-11T12:00:00Z', dateSource: 'NFSE_DH_PROC' });
const envelope = (length = 26) => ({ version: 1, scope: { ...scope }, data: { rows: Array.from({ length }, (_, index) => row(index)),
  page: 1, pageSize: 10000, totalItems: length, totalAmount: (length / 100).toFixed(2), generatedAt: '2026-11-11T12:00:00Z' } });

test('report uses one server snapshot for all rows and canonical amount with exact scope/filter args', async () => {
  const calls = [], fixture = envelope(501), controller = new AbortController();
  const service = createNfseIssuedExportService(async (...args) => { calls.push(args); return fixture; }, true);
  const result = await service(scope, filters, controller.signal);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'get_nfse_issued_report_secure');
  assert.deepEqual(calls[0][1], { p_polo_id: scope.poloId, p_context_key: scope.contextKey, p_environment: scope.environment, p_month: scope.month,
    p_search: 'TESTE', p_date_from: filters.dateFrom, p_date_to: filters.dateTo, p_course_type: 'TECNICO', p_origin: 'ALUNO' });
  assert.equal(calls[0][2], controller.signal); assert.equal(result.rows.length, 501); assert.equal(result.totalAmount, '5.01');
  assert.equal(result.filters.search, 'TESTE'); assert.notEqual(result.scope, scope);
});

test('empty and unknown totals are preserved without converting unknown into zero', async () => {
  const fixture = envelope(0); const service = createNfseIssuedExportService(async () => fixture, true);
  assert.equal((await service(scope, filters)).totalAmount, '0.00');
  fixture.data.totalAmount = null; assert.equal((await service(scope, filters)).totalAmount, null);
});

test('rejects partial/oversized/duplicate/cancelled/mismatched snapshots before PDF rendering', async () => {
  const mutations = [
    fixture => { fixture.data.rows.pop(); },
    fixture => { fixture.data.totalItems = 10001; },
    fixture => { fixture.data.page = 2; },
    fixture => { fixture.data.pageSize = 25; },
    fixture => { fixture.data.rows[1].id = fixture.data.rows[0].id; },
    fixture => { fixture.data.rows[1].accessKey = fixture.data.rows[0].accessKey; },
    fixture => { fixture.data.rows[0].state = 'CANCELLED'; },
    fixture => { fixture.data.rows[0].number = 'invalid'; },
    fixture => { fixture.data.rows[0].status = 'ERRO'; },
    fixture => { fixture.data.generatedAt = 'invalid'; },
    fixture => { fixture.data.totalAmount = 0.26; },
    fixture => { fixture.scope.poloId = '00000000-0000-4000-8000-000000000002'; },
    fixture => { fixture.scope.environment = 'HOMOLOGACAO'; },
    fixture => { fixture.scope.contextKey = 'other-context'; },
  ];
  for (const mutate of mutations) {
    const fixture = envelope(); mutate(fixture);
    await assert.rejects(createNfseIssuedExportService(async () => fixture, true)(scope, filters), { name: 'NfseContractError' });
  }
});

test('invalid dates, unavailable backend and cancellation do not proceed with export', async () => {
  let calls = 0; const transport = async () => { calls += 1; return envelope(); };
  await assert.rejects(createNfseIssuedExportService(transport)(scope, filters), { name: 'NfseUnavailableError' });
  const service = createNfseIssuedExportService(transport, true);
  await assert.rejects(service(scope, { ...filters, dateFrom: '2026-12-01' }), { name: 'NfseContractError' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service(scope, filters, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});
test.after(() => rm(directory, { recursive: true, force: true }));
