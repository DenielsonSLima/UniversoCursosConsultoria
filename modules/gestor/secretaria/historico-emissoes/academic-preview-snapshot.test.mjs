import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { createStudentBulletinDatabase, issueBulletin } from '../../../../supabase/tests/fixtures/student-bulletin-harness.mjs';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./academic-preview.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'academic-read-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'database', namespace: 'fixture' }));
    plugin.onResolve({ filter: /lib\/htmlSanitizer$/ }, () => ({ path: 'text', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => path === 'text' ? ({
      contents: 'export const escapeHtmlText=value=>String(value ?? "");', loader: 'js',
    }) : ({
      contents: `export const supabase={rpc:async(name,parameters)=>{
        const io=globalThis.__bulletinAcademicIO;io.calls.push({name,parameters});return io.reply;
      }};`, loader: 'js',
    }));
  } }],
});
const bundleDir = await mkdtemp(join(tmpdir(), 'universo-academic-preview-'));
const bundlePath = join(bundleDir, 'academic-preview.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
after(() => rm(bundleDir, { recursive: true, force: true }));
const { loadAcademicPreview, buildAcademicPreviewFromPayload } = await import(
  pathToFileURL(bundlePath).href,
);

const component = (discipline, note = 8) => ({
  moduleId: 'module', moduleName: 'Módulo sintético', moduleOrder: 1,
  disciplineId: discipline, discipline, disciplineOrder: 1,
  cargaHoraria: 40, cargaHorariaTeoria: 40, cargaHorariaPratica: 0, cargaHorariaEstagio: 0,
  nota: note, notaEstagio: null, frequencia: 90, frequenciaEstagio: null, situacao: 'Aprovado',
});
const academic = () => ({
  studentMatricula: 'UNIV-SYNTHETIC', studentDocumentType: null, studentCpf: null, studentRg: null,
  componentes: [component('Zeta'), component('Alfa', 10)], mediaGeral: 7.123,
  frequenciaGeral: 81.234, cargaHorariaCumprida: 55, cargaHorariaTotal: 100,
  inicioCurso: '2026-01-01', fimCurso: null, situacaoAcademica: 'Ativo(a)',
});
const emission = (snapshot = undefined) => ({
  documento: 'boletim', codigo: 'BOL-SYNTHETIC', matricula_id: 'enrollment', periodo_referencia: 'module',
  dados_emissao: snapshot === undefined ? {} : { academicDataSnapshot: snapshot },
});
const start = (payload = academic()) => {
  globalThis.__bulletinAcademicIO = { calls: [], reply: { data: payload, error: null } };
  return globalThis.__bulletinAcademicIO;
};

test('frozen bulletin preserves backend order, summaries and explicit null identity without live IO', async () => {
  const frozen = academic();
  const io = start({ ...frozen, mediaGeral: 10, frequenciaGeral: 100 });
  const preview = await loadAcademicPreview(emission(frozen));
  assert.deepEqual(preview.componentes.map(row => row.discipline), ['Zeta', 'Alfa']);
  assert.equal(preview.mediaGeral, 7.123);
  assert.equal(preview.frequenciaGeral, 81.234);
  assert.equal(preview.cargaHorariaCumprida, 55);
  assert.equal(preview.cargaHorariaTotal, 100);
  assert.equal(preview.studentDocumentType, null);
  assert.equal(preview.studentCpf, null);
  assert.equal(preview.studentRg, null);
  assert.equal(io.calls.length, 0);
  for (const table of [preview.componentesTable, preview.historicoTable]) {
    assert.ok(table.indexOf('Zeta') < table.indexOf('Alfa'));
  }
});

test('present null, malformed or foreign-module academic snapshots fail without live fallback', async () => {
  const io = start();
  for (const snapshot of [null, [], {}, { componentes: [] }, { componentes: [null] },
    { ...academic(), componentes: [component('Foreign')].map(row => ({ ...row, moduleId: 'other' })) }]) {
    await assert.rejects(loadAcademicPreview(emission(snapshot)), /snapshot acadêmico.*inválido/i);
  }
  const withoutModule = emission(academic());
  withoutModule.periodo_referencia = null;
  await assert.rejects(loadAcademicPreview(withoutModule), /snapshot acadêmico.*inválido/i);
  assert.equal(io.calls.length, 0);
});

test('legacy bulletin without a snapshot keeps the existing authorized live getter and calculations', async () => {
  const io = start();
  const preview = await loadAcademicPreview(emission());
  assert.deepEqual(io.calls, [{ name: 'get_secretaria_documento_academico',
    parameters: { p_matricula_id: 'enrollment', p_documento: 'boletim' } }]);
  assert.equal(preview.mediaGeral, 9);
  assert.deepEqual(preview.componentes.map(row => row.discipline), ['Alfa', 'Zeta']);
  io.reply = { data: null, error: new Error('Leitura acadêmica recusada') };
  await assert.rejects(loadAcademicPreview(emission()), /Leitura acadêmica recusada/);
});

test('changed SQL grades generate a current code while the previous manager and student payloads agree', async () => {
  const db = await createStudentBulletinDatabase();
  const io = start();
  try {
    const first = await issueBulletin(db);
    await db.exec("UPDATE public.test_diary_results SET media_final=10,frequencia_percent=100,resultado_final='APROVADO'");
    const current = await issueBulletin(db);
    const historicalRow = (await db.query('SELECT * FROM public.documentos_validacao WHERE codigo=$1',
      [first.emission.codigo])).rows[0];
    const managerPrevious = await loadAcademicPreview(historicalRow);
    const studentPrevious = buildAcademicPreviewFromPayload(first.preview.academicData, null, true);
    assert.deepEqual(managerPrevious, studentPrevious);
    assert.equal(managerPrevious.mediaGeral, 7);
    assert.equal(managerPrevious.frequenciaGeral, 80);
    assert.equal((await loadAcademicPreview(current.emission)).mediaGeral, 10);
    assert.equal(current.preview.academicData.frequenciaGeral, 100);
    assert.notEqual(current.emission.codigo, first.emission.codigo);
    assert.equal((await issueBulletin(db)).emission.codigo, current.emission.codigo);
    assert.equal(io.calls.length, 0);
  } finally {
    await db.close();
  }
});
