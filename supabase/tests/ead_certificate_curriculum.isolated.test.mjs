import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import {
  newDatabase, submit, state, emit, applyCurriculumMigrations, config, other,
} from './fixtures/ead-certificate-test-harness.mjs';

const titles = [
  'Rotinas administrativas', 'Atendimento e comunicação', 'Documentos e arquivos',
  'Noções financeiras', 'Ferramentas digitais', 'Ética e plano de ação',
];
const sixModules = {
  ...config,
  cronograma: titles.map((titulo, index) => ({
    id: `module-${index + 1}`, titulo, ordem: index + 1, cargaHoraria: 27,
  })).reverse(),
};
const payload = (record) => ({
  eadCurriculum: record.eadCurriculum, programContent: record.programContent,
});
const withoutPayload = (record) => {
  const { eadCurriculum, programContent, ...rest } = record;
  return rest;
};
const complete = async (db) => {
  const id = (await state(db)).certificates[0].id;
  return (await db.query(
    'SELECT internal_academic.ead_complementar_conteudo_certificado($1) AS result', [id],
  )).rows[0].result;
};
const legacy = async () => {
  const db = await newDatabase({ courseConfig: sixModules, curriculum: false });
  await submit(db);
  await applyCurriculumMigrations(db);
  return db;
};

test('emissão real congela seis módulos ordenados no certificado e na validação, sem ratear horas', async () => {
  const db = await newDatabase({ courseConfig: sixModules, totalHours: 160 });
  try {
    await submit(db);
    const data = await state(db);
    const snapshot = payload(data.certificates[0].metadados);
    assert.deepEqual(snapshot, payload(data.documents[0].dados_emissao));
    assert.deepEqual(snapshot.eadCurriculum.items.map(item => item.title), titles);
    assert.equal(snapshot.eadCurriculum.source, 'cronograma');
    assert.equal(snapshot.eadCurriculum.totalHours, 160);
    assert.equal(snapshot.eadCurriculum.pages.length, 1);
    assert.equal(snapshot.eadCurriculum.pages[0].lines.length, 6);
    assert.equal(snapshot.programContent, titles.map((title, i) => `${i + 1}. ${title}`).join('\n'));
    assert.equal(JSON.stringify(snapshot).includes('respostaCorreta'), false);
    assert.equal(JSON.stringify(snapshot).includes('cargaHoraria'), false);
    const before = await state(db);
    await db.exec(`UPDATE cursos SET ead_config = ead_config || '{"cronograma":[]}'::jsonb`);
    await submit(db);
    assert.deepEqual(await state(db), before);
    if (process.env.EAD_CURRICULUM_FIXTURE_OUT) {
      await writeFile(process.env.EAD_CURRICULUM_FIXTURE_OUT, JSON.stringify({
        certificate: data.certificates[0], document: data.documents[0],
      }, null, 2));
    }
  } finally { await db.close(); }
});

test('fallback usa aulas; paginação canônica preserva títulos longos sem truncar conteúdo', async () => {
  const db = await newDatabase();
  try {
    const longTitles = Array.from({ length: 20 }, (_, i) =>
      `Aula ${i + 1} ${'Documentação e gestão '.repeat(8)}fim`);
    const courseConfig = { conteudos: longTitles.map((titulo, i) => ({ id: `a${i}`, titulo })) };
    const result = (await db.query(
      'SELECT internal_academic.ead_certificate_curriculum_snapshot($1,NULL) AS payload',
      [JSON.stringify(courseConfig)],
    )).rows[0].payload;
    assert.equal(result.eadCurriculum.source, 'conteudos');
    assert.equal(result.eadCurriculum.totalHours, null);
    assert.deepEqual(result.eadCurriculum.items.map(item => item.title), longTitles);
    assert.ok(result.eadCurriculum.pages.length > 1);
    for (const [index, page] of result.eadCurriculum.pages.entries()) {
      assert.equal(page.number, index + 1);
      assert.ok(page.lines.length <= 16);
      assert.ok(page.lines.every(line => [...line].length <= 70));
    }
    assert.equal(result.eadCurriculum.pages.flatMap(page => page.lines).join(' '),
      result.programContent.replaceAll('\n', ' '));
    for (const invalidHours of [0, -120]) {
      await assert.rejects(db.query(
        'SELECT internal_academic.ead_certificate_curriculum_snapshot($1,$2)',
        [JSON.stringify(courseConfig), invalidHours],
      ), /carga horária total.*positiva/);
    }
  } finally { await db.close(); }
});

test('curso sem título programático falha atomicamente e não emite documento genérico', async () => {
  const db = await newDatabase({ courseConfig: { ...config, cronograma: [{ id: 'empty' }] } });
  try {
    const before = await state(db);
    await assert.rejects(submit(db), /item sem título/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('reutilização copia a grade congelada para o certificado sem usar o curso atual ou alterar o documento', async () => {
  const db = await newDatabase({ courseConfig: sixModules, totalHours: 160 });
  try {
    await submit(db);
    const issued = await state(db);
    await db.exec(`UPDATE certificados_academicos SET status='PENDENTE',
      codigo_validacao=NULL,emitido_em=NULL,metadados=metadados-ARRAY['eadCurriculum','programContent'];
      UPDATE cursos SET carga_horaria=999,ead_config=ead_config ||
        '{"cronograma":[{"id":"changed","titulo":"Grade cadastrada após a emissão"}]}'::jsonb;`);
    await emit(db);
    const restored = await state(db);
    assert.equal(restored.certificates[0].status, 'FINALIZADO');
    assert.equal(restored.certificates[0].codigo_validacao, issued.certificates[0].codigo_validacao);
    assert.equal(restored.certificates[0].emitido_em, issued.certificates[0].emitido_em);
    assert.deepEqual(payload(restored.certificates[0].metadados), payload(issued.documents[0].dados_emissao));
    assert.deepEqual(restored.documents, issued.documents);
    assert.equal((await complete(db)).changed, false);
    assert.deepEqual(await state(db), restored);
  } finally { await db.close(); }
});

test('reutilização sem grade congelada ou com conteúdo inválido falha antes de finalizar', async () => {
  for (const invalid of [false, true]) {
    const db = invalid ? await newDatabase({ courseConfig: sixModules }) : await legacy();
    try {
      if (invalid) {
        await submit(db);
        await db.exec(`UPDATE documentos_validacao SET dados_emissao=dados_emissao || '{"programContent":"Divergente"}'::jsonb`);
      }
      await db.exec(`UPDATE certificados_academicos SET status='PENDENTE',
        codigo_validacao=NULL,emitido_em=NULL,metadados=metadados-ARRAY['eadCurriculum','programContent']`);
      const before = await state(db);
      await assert.rejects(emit(db), /conteúdo programático EAD congelado/);
      assert.deepEqual(await state(db), before);
    } finally { await db.close(); }
  }
});

test('complemento legado altera apenas os dois campos novos, sem código, data, nota ou emissão nova', async () => {
  const db = await legacy();
  try {
    const before = await state(db);
    assert.equal((await complete(db)).changed, true);
    const after = await state(db);
    assert.deepEqual(payload(after.certificates[0].metadados), payload(after.documents[0].dados_emissao));
    assert.deepEqual({ ...after.certificates[0], metadados: withoutPayload(after.certificates[0].metadados) }, before.certificates[0]);
    assert.deepEqual({ ...after.documents[0], dados_emissao: withoutPayload(after.documents[0].dados_emissao) }, before.documents[0]);
    assert.deepEqual(after.progress, before.progress);
    assert.deepEqual(after.enrollment, before.enrollment);
    await db.exec("UPDATE cursos SET updated_at = now() + interval '1 day'");
    assert.equal((await complete(db)).changed, false);
    assert.deepEqual(await state(db), after);
  } finally { await db.close(); }
});

test('complemento não substitui snapshot parcial ou divergente', async () => {
  for (const update of [
    `UPDATE documentos_validacao SET dados_emissao = dados_emissao || '{"programContent":"Histórico existente"}'::jsonb`,
    `UPDATE certificados_academicos SET metadados = metadados || '{"eadCurriculum":null}'::jsonb`,
  ]) {
    const db = await legacy();
    try {
      await db.exec(update);
      const before = await state(db);
      await assert.rejects(complete(db), /existente ou divergente/);
      assert.deepEqual(await state(db), before);
    } finally { await db.close(); }
  }
});

test('manutenção rejeita revogação, expiração, outra titularidade, cancelamento e grade posterior', async () => {
  const cases = [
    ["UPDATE documentos_validacao SET status='REVOGADO'", /validação EAD ativa/],
    ["UPDATE documentos_validacao SET validade_ate='2000-01-01'", /validação EAD ativa/],
    [`UPDATE documentos_validacao SET aluno_id='${other}'`, /validação EAD ativa/],
    [`UPDATE documentos_validacao SET polo_id='${other}'`, /validação EAD ativa/],
    ["UPDATE certificados_academicos SET status='CANCELADO'", /finalizado e coerente/],
    ["UPDATE cursos SET modalidade='TECNICO'", /exclusivo de curso EAD/],
    ["UPDATE cursos SET updated_at=now()+interval '1 day'", /alterado após a emissão/],
  ];
  for (const [update, error] of cases) {
    const db = await legacy();
    try {
      await db.exec(update);
      const before = await state(db);
      await assert.rejects(complete(db), error);
      assert.deepEqual(await state(db), before);
    } finally { await db.close(); }
  }
});

test('helpers de currículo não oferecem caminho direto para navegador ou service_role', async () => {
  const db = await newDatabase();
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const result = (await db.query(`SELECT
        has_function_privilege($1,'internal_academic.ead_certificate_curriculum_snapshot(jsonb,numeric)','EXECUTE') AS builder,
        has_function_privilege($1,'internal_academic.ead_certificate_curriculum_from_snapshot(jsonb)','EXECUTE') AS validator,
        has_function_privilege($1,'internal_academic.ead_complementar_conteudo_certificado(uuid)','EXECUTE') AS maintenance`, [role])).rows[0];
      assert.deepEqual(result, { builder: false, validator: false, maintenance: false });
    }
  } finally { await db.close(); }
});

test('trigger que altere dados históricos faz o complemento reverter integralmente', async () => {
  const db = await legacy();
  try {
    await db.exec(`CREATE FUNCTION unexpected_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.ultima_emissao_em := now(); RETURN NEW; END $$;
      CREATE TRIGGER unexpected_change BEFORE UPDATE ON documentos_validacao
      FOR EACH ROW EXECUTE FUNCTION unexpected_change();`);
    const before = await state(db);
    await assert.rejects(complete(db), /fora do conteúdo programático/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});
