import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import {
  newDatabase, submit, state, emit, applyTableMigrations, config, other,
} from './fixtures/ead-certificate-test-harness.mjs';

const courseConfig = (hours = 20, count = 6) => ({
  ...config,
  conteudos: Array.from({ length: count }, (_, i) => ({
    id: `lesson-${i + 1}`, titulo: `Componente ${i + 1}`, duracaoMinutos: 1600, duracao: '27h',
  })),
  cronograma: Array.from({ length: count }, (_, i) => ({
    id: `module-${i + 1}`, titulo: `Componente ${i + 1}`, ordem: i + 1,
    conteudos: [`lesson-${i + 1}`], cargaHoraria: hours,
  })).reverse(),
});
const tableOf = (data) => data.documents[0].dados_emissao.eadCurriculumTable;
const withoutTable = ({ eadCurriculumTable, ...rest }) => rest;
const complete = async (db) => (await db.query(
  'SELECT internal_academic.ead_complementar_tabela_certificado($1) AS result',
  [(await state(db)).certificates[0].id],
)).rows[0].result;
const legacy = async () => {
  const db = await newDatabase({ courseConfig: courseConfig(), table: false });
  await submit(db);
  await applyTableMigrations(db);
  return db;
};
const build = async (db, data, hours = 120, progress = {}) => (await db.query(`SELECT
  internal_academic.ead_certificate_table_snapshot($1,$2,$3,
    internal_academic.ead_certificate_curriculum_snapshot($1,$2)) AS payload`,
[JSON.stringify(data), hours, JSON.stringify(progress)])).rows[0].payload.eadCurriculumTable;

test('emissão real congela tabela de seis componentes 20h/concluído e preserva currículo v1', async () => {
  const db = await newDatabase({ courseConfig: courseConfig() });
  try {
    await submit(db);
    const data = await state(db);
    const table = tableOf(data);
    assert.equal(table.version, 2);
    assert.deepEqual(table, data.certificates[0].metadados.eadCurriculumTable);
    assert.deepEqual(table.rows, Array.from({ length: 6 }, (_, i) => ({
      nome: `Componente ${i + 1}`, carga: '20h', status: 'Concluído',
    })));
    assert.deepEqual(table.pages, [{ number: 1, rows: table.rows }]);
    assert.equal(table.quality.hoursStatus, 'CONSISTENT');
    assert.equal(table.quality.gradeSource, 'NONE');
    assert.equal(data.documents[0].dados_emissao.eadCurriculum.version, 1);
    assert.equal(data.certificates[0].nota_final, 100);
    const before = await state(db);
    await submit(db);
    assert.deepEqual(await state(db), before);
    if (process.env.EAD_TABLE_FIXTURE_OUT) await writeFile(process.env.EAD_TABLE_FIXTURE_OUT,
      JSON.stringify({ certificate: data.certificates[0], document: data.documents[0] }, null, 2));
  } finally { await db.close(); }
});

test('carga 27x6 divergente de160 não usa duração de vídeo nem inventa nota por componente', async () => {
  const db = await newDatabase({ courseConfig: courseConfig(27), totalHours: 160 });
  try {
    await submit(db);
    const table = tableOf(await state(db));
    assert.ok(table.rows.every(row => row.carga === '—' && row.status === 'Concluído'));
    assert.equal(table.quality.scheduledHours, 162);
    assert.equal(table.quality.officialHours, 160);
    assert.equal(table.quality.hoursSource, 'cronograma.cargaHoraria');
    assert.equal(table.quality.hoursStatus, 'MODULE_TOTAL_MISMATCH');
    assert.equal(JSON.stringify(table.rows).includes('100'), false);
    assert.equal(JSON.stringify(table.rows).includes('Aprovado'), false);
  } finally { await db.close(); }
});

test('carga ausente e conclusão desconhecida permanecem travessão, mesmo com quiz100', async () => {
  const db = await newDatabase();
  try {
    const input = courseConfig();
    delete input.cronograma[0].cargaHoraria;
    const table = await build(db, input, 120, {
      completedContentIds: ['lesson-1'], completedScheduleIds: ['module-2'], quizScore: 100,
    });
    assert.ok(table.rows.every(row => row.carga === '—'));
    assert.equal(table.rows[0].status, 'Concluído');
    assert.ok(table.rows.slice(1).every(row => row.status === '—'));
    assert.equal(table.quality.hoursStatus, 'MISSING_MODULE_HOURS');
    assert.equal(table.quality.completionStatus, 'PARTIAL_OR_UNKNOWN');
    const unknownId = courseConfig();
    unknownId.cronograma[0].conteudos = ['not-a-course-lesson'];
    const unknownTable = await build(db, unknownId, 120, { completedContentIds: ['not-a-course-lesson'] });
    assert.ok(unknownTable.rows.every(row => row.status === '—'));
    const noOfficial = await build(db, courseConfig(), null);
    assert.equal(noOfficial.quality.hoursStatus, 'MISSING_OFFICIAL_HOURS');
    assert.ok(noOfficial.rows.every(row => row.carga === '—'));
  } finally { await db.close(); }
});

test('fallback aulas não trata duração como carga acadêmica; paginação mantém ordem e títulos', async () => {
  const db = await newDatabase();
  try {
    const input = courseConfig(20, 13);
    delete input.cronograma;
    input.conteudos[1].titulo = 'Título extenso '.repeat(12).trim();
    const table = await build(db, input, 260, { completedContentIds: input.conteudos.map(row => row.id) });
    assert.equal(table.quality.hoursStatus, 'SOURCE_WITHOUT_MODULE_HOURS');
    assert.ok(table.rows.every(row => row.carga === '—' && row.status === 'Concluído'));
    assert.ok(table.pages.length > 1);
    assert.ok(table.pages.every(page => page.rows.length <= 6));
    assert.deepEqual(table.pages.flatMap(page => page.rows), table.rows);
    assert.deepEqual(table.rows.map(row => row.nome), input.conteudos.map(row => row.titulo));
  } finally { await db.close(); }
});

test('complemento legado acrescenta só tabela, mantendo integralmente v1, código, datas e contador', async () => {
  const db = await legacy();
  try {
    const before = await state(db);
    assert.equal((await complete(db)).changed, true);
    const after = await state(db);
    assert.deepEqual({ ...after.certificates[0], metadados: withoutTable(after.certificates[0].metadados) }, before.certificates[0]);
    assert.deepEqual({ ...after.documents[0], dados_emissao: withoutTable(after.documents[0].dados_emissao) }, before.documents[0]);
    assert.deepEqual(after.progress, before.progress);
    assert.deepEqual(after.enrollment, before.enrollment);
    await db.exec("UPDATE cursos SET updated_at=now()+interval '1 day'");
    assert.equal((await complete(db)).changed, false);
    assert.deepEqual(await state(db), after);
  } finally { await db.close(); }
});

test('reutilização copia apenas tabela congelada válida; ausência ou página adulterada falha', async () => {
  const db = await newDatabase({ courseConfig: courseConfig() });
  try {
    await submit(db);
    const issued = await state(db);
    await db.exec(`UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL,
      metadados=metadados-'eadCurriculumTable';
      UPDATE cursos SET carga_horaria=999;`);
    await emit(db);
    assert.deepEqual((await state(db)).documents, issued.documents);
    assert.deepEqual((await state(db)).certificates[0].metadados.eadCurriculumTable, tableOf(issued));
    for (const update of [
      "UPDATE documentos_validacao SET dados_emissao=jsonb_set(dados_emissao,'{eadCurriculumTable,pages}','[]')",
      "UPDATE documentos_validacao SET dados_emissao=dados_emissao-'eadCurriculumTable'",
    ]) {
      await db.exec(`UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL`);
      await db.exec(update);
      const before = await state(db);
      await assert.rejects(emit(db), /tabela EAD congelada/);
      assert.deepEqual(await state(db), before);
    }
  } finally { await db.close(); }
});

test('manutenção protege curso histórico, titularidade, validade e snapshots parciais', async () => {
  for (const [update, message] of [
    ["UPDATE cursos SET updated_at=now()+interval '1 day'", /alterado após a emissão/],
    ["UPDATE cursos SET carga_horaria=999", /grade EAD congelada diverge/],
    ["UPDATE certificados_academicos SET status='CANCELADO'", /finalizado e coerente/],
    ["UPDATE documentos_validacao SET status='REVOGADO'", /validação EAD ativa/],
    ["UPDATE documentos_validacao SET validade_ate='2000-01-01'", /validação EAD ativa/],
    [`UPDATE documentos_validacao SET polo_id='${other}'`, /validação EAD ativa/],
    ["UPDATE certificados_academicos SET metadados=metadados || '{\"eadCurriculumTable\":null}'", /existente ou divergente/],
  ]) {
    const db = await legacy();
    try {
      await db.exec(update);
      const before = await state(db);
      await assert.rejects(complete(db), message);
      assert.deepEqual(await state(db), before);
    } finally { await db.close(); }
  }
});

test('helpers privados não recebem EXECUTE e falha de trigger reverte o complemento', async () => {
  const db = await legacy();
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const row = (await db.query(`SELECT
        has_function_privilege($1,'internal_academic.ead_certificate_table_snapshot(jsonb,numeric,jsonb,jsonb)','EXECUTE') AS builder,
        has_function_privilege($1,'internal_academic.ead_certificate_table_from_snapshot(jsonb)','EXECUTE') AS validator,
        has_function_privilege($1,'internal_academic.ead_complementar_tabela_certificado(uuid)','EXECUTE') AS maintenance`, [role])).rows[0];
      assert.deepEqual(row, { builder: false, validator: false, maintenance: false });
    }
    await db.exec(`CREATE FUNCTION unexpected_table_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.quantidade_emissoes := NEW.quantidade_emissoes+1; RETURN NEW; END $$;
      CREATE TRIGGER unexpected_table_change BEFORE UPDATE ON documentos_validacao
      FOR EACH ROW EXECUTE FUNCTION unexpected_table_change();`);
    const before = await state(db);
    await assert.rejects(complete(db), /fora do conteúdo programático/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});
