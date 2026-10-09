import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../enrollment-runner.mjs')) : import.meta.url);
let selectPrimaryEnrollment, formatAcademicEnrollment;
const config = { matriculaPrefix: 'UNIV-', matriculaDigits: 4, yearFormat: 'yy', usePoloCode: false };
const make = (suffix, status = 'ATIVO', date = '2026-07-01') => ({
  id: `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`, status, data_matricula: date,
});

before(async () => {
  const result = await requireTool('esbuild').build({
    entryPoints: [resolve(directory, 'utils/aluno-primary-enrollment.ts')], bundle: true, write: false,
    format: 'esm', platform: 'node', plugins: [{ name: 'no-remote-config', setup(plugin) {
      plugin.onResolve({ filter: /academicos\/academicos\.service$/ }, () => ({ path: 'config', namespace: 'controlled-io' }));
      plugin.onLoad({ filter: /^config$/, namespace: 'controlled-io' }, () => ({ contents:
        `export const DEFAULT_CONFIGS=${JSON.stringify(config)}; export const academicosService={getConfigsSync(){throw Error('Explicit persisted configuration required')}};` }));
    } }],
  });
  ({ selectPrimaryEnrollment, formatAcademicEnrollment } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`));
});

test('one academic enrollment supplies its number instead of the partner UUID or access alias', () => {
  const partnerId = '00000000-0000-4000-8000-000000000ddf';
  const enrollment = make('1701');
  const primary = selectPrimaryEnrollment([enrollment]);
  assert.equal(primary.id, enrollment.id);
  assert.equal(formatAcademicEnrollment(primary, config), 'UNIV-265889');
  assert.notEqual(primary.id, partnerId);
  assert.notEqual(formatAcademicEnrollment(primary, config), 'UNIV-A-00001000');
});

test('an older active enrollment wins over a recent cancelled enrollment without mutating either record', () => {
  const active = make('1701', 'ATIVO', '2025-03-01');
  const cancelled = make('270f', 'CANCELADO', '2026-10-01');
  const original = [cancelled, active];
  const snapshot = structuredClone(original);
  assert.equal(selectPrimaryEnrollment(original).id, active.id);
  assert.deepEqual(original, snapshot);
});

test('multiple courses remain distinct and primary choice is deterministic regardless of transport order', () => {
  const old = make('12', 'ATIVO', '2025-01-01');
  const sameDayHigh = make('44', 'ATIVO', '2026-06-01');
  const sameDayLow = make('33', 'ATIVO', '2026-06-01');
  const undated = make('01', 'ATIVO', null);
  const variants = [
    [old, sameDayHigh, sameDayLow, undated], [undated, sameDayLow, old, sameDayHigh],
    [sameDayHigh, old, undated, sameDayLow],
  ];
  for (const rows of variants) assert.equal(selectPrimaryEnrollment(rows).id, sameDayLow.id);
  assert.equal(new Set(variants[0].map(row => formatAcademicEnrollment(row, config))).size, 4);
});

test('historical enrollment remains available when there is no active one; empty registration invents no matrícula', () => {
  const historical = make('10', 'CONCLUIDO', '2025-02-01');
  const older = make('20', 'CANCELADO', '2024-02-01');
  assert.equal(selectPrimaryEnrollment([older, historical]).id, historical.id);
  assert.equal(selectPrimaryEnrollment([]), null);
  assert.equal(formatAcademicEnrollment(null, config), null);
  assert.equal(selectPrimaryEnrollment([{ id: '', status: 'ATIVO' }]), null);
});

test('saved academic configuration and enrollment polo are used for both raw and list projections', () => {
  const persisted = { ...config, matriculaPrefix: 'ESC-', matriculaDigits: 6, yearFormat: 'yyyy', usePoloCode: true };
  const polo = '55555555-5555-5555-5555-555555555555';
  const raw = { ...make('1701', 'ATIVO', '2024-08-01'), turmas: [{ polo_id: polo }] };
  const summary = { id: raw.id, status: raw.status, dataMatricula: raw.data_matricula, poloId: polo };
  assert.equal(formatAcademicEnrollment(raw, persisted), 'ESC-202402005889');
  assert.equal(formatAcademicEnrollment(summary, persisted), 'ESC-202402005889');
  assert.equal(formatAcademicEnrollment({ ...raw, turmas: { polo_id: polo } }, persisted), 'ESC-202402005889');
});

test('equivalent timezone offsets use ID tie-break and malformed dates remain last', () => {
  const lowId = make('01', 'ATIVO', '2026-10-01T10:00:00-03:00');
  const highId = make('02', 'ATIVO', '2026-10-01T13:00:00Z');
  const invalid = make('00', 'ATIVO', 'not-a-date');
  assert.equal(selectPrimaryEnrollment([highId, invalid, lowId]).id, lowId.id);
  const later = make('03', 'ATIVO', '2026-10-01T11:00:00-03:00');
  assert.equal(selectPrimaryEnrollment([lowId, later, highId]).id, later.id);
});

test('class polo overrides an obsolete direct projection when both appear', () => {
  const row = { ...make('1701'), poloId: '11111111-1111-4111-8111-111111111111',
    turmas: { polo_id: '55555555-5555-5555-5555-555555555555' } };
  assert.equal(formatAcademicEnrollment(row, { ...config, usePoloCode: true }), 'UNIV-26025889');
});

test('strict academic configuration rejects transport errors, accepts absent configuration and reuses a valid cache', async () => {
  const result = await requireTool('esbuild').build({
    entryPoints: [resolve(directory, '../configuracoes/academicos/academicos.service.ts')],
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'config-controlled-transport', setup(plugin) {
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'rpc', namespace: 'config-test' }));
      plugin.onLoad({ filter: /^rpc$/, namespace: 'config-test' }, () => ({ contents: `
        export const supabase={from(){const query={select(){return query},eq(){return query},
          maybeSingle(){globalThis.academicReads++;return Promise.resolve(globalThis.academicReply)}};return query}};` }));
    } }],
  });
  const { academicosService, DEFAULT_CONFIGS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const previousError = console.error;
  console.error = () => {};
  try {
    globalThis.academicReads = 0;
    globalThis.academicReply = { data: null, error: { message: 'Configuration unavailable' } };
    await assert.rejects(academicosService.getConfigsStrict(), error => error.message === 'Configuration unavailable');
    assert.deepEqual(await academicosService.getConfigs(), DEFAULT_CONFIGS, 'Other existing consumers retain their original fallback contract.');
    await assert.rejects(academicosService.getConfigsStrict());
    globalThis.academicReply = { data: null, error: null };
    assert.deepEqual(await academicosService.getConfigsStrict(), DEFAULT_CONFIGS);
    globalThis.academicReply = { data: { conteudo: { matriculaPrefix: 'REAL-', matriculaDigits: 6 } }, error: null };
    const persisted = await academicosService.getConfigsStrict();
    assert.equal(persisted.matriculaPrefix, 'REAL-');
    const readsAfterSuccess = globalThis.academicReads;
    globalThis.academicReply = { data: null, error: { message: 'Must not be requested while cache is valid' } };
    assert.equal((await academicosService.getConfigsStrict()).matriculaPrefix, 'REAL-');
    assert.equal(globalThis.academicReads, readsAfterSuccess);
    academicosService.invalidateCache();
    await assert.rejects(academicosService.getConfigsStrict());
  } finally {
    console.error = previousError;
    delete globalThis.academicReads;
    delete globalThis.academicReply;
  }
});
