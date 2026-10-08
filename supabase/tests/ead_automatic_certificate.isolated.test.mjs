import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const alumno = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const course = '33333333-3333-4333-8333-333333333333';
const turma = '44444444-4444-4444-8444-444444444444';
const enrollment = '55555555-5555-4555-8555-555555555555';
const unit = '66666666-6666-4666-8666-666666666666';
const certId = '77777777-7777-4777-8777-777777777777';
const historical = [
  '20260715002000_secure_ead_progress_and_completion.sql',
  '20260822114100_lock_ead_completion_enrollment.sql',
  '20260822114300_serialize_ead_assessment_mutations.sql',
];
const migrations = [
  '20261008122500_auto_issue_ead_certificate.sql',
  '20261008122510_complete_ead_with_automatic_certificate.sql',
  '20261008122520_separate_ead_certificate_finalization.sql',
];
const answers = (correct = 10) => Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [`q${index}`, index < correct ? 0 : 1]),
);
const config = {
  conteudos: [{ id: 'lesson' }], atividades: [],
  provas: [{ notaMinima: 70, questoes: Array.from({ length: 10 }, (_, index) => ({
    id: `q${index}`, opcoes: ['A', 'B'], respostaCorreta: 0,
  })) }],
};

const newDatabase = async ({ modality = 'EAD', status = 'ATIVO', lessons = true } = {}) => {
  const db = new PGlite();
  await db.exec(await read('./fixtures/ead-auto-certificate-schema.sql'));
  for (const name of historical) await db.exec(await read(`../migrations/${name}`));
  await db.exec(await read('./fixtures/ead-certificate-original-issuers.sql'));
  for (const name of migrations) await db.exec(await read(`../migrations/${name}`));
  await db.query("SELECT set_config('test.aluno_id', $1, false)", [alumno]);
  await db.query('INSERT INTO parceiros(id,nome,cpf_cnpj) VALUES ($1,$2,$3)',
    [alumno, 'Aluno sintético', '00000000000']);
  await db.query('INSERT INTO polos(id,nome) VALUES ($1,$2)', [unit, 'Polo de teste']);
  await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config) VALUES ($1,$2,$3,$4)',
    [course, 'Curso de teste', modality, JSON.stringify(config)]);
  await db.query('INSERT INTO turmas(id,curso_id,polo_id) VALUES ($1,$2,$3)', [turma, course, unit]);
  await db.query('INSERT INTO matriculas(id,aluno_id,turma_id,status) VALUES ($1,$2,$3,$4)',
    [enrollment, alumno, turma, status]);
  await db.query('INSERT INTO internal_academic.ead_assessment_answer_keys(course_id) VALUES ($1)', [course]);
  await db.query('INSERT INTO ead_aluno_progresso(aluno_id,curso_id,progress) VALUES ($1,$2,$3)',
    [alumno, course, JSON.stringify({
      completedContentIds: lessons ? ['lesson'] : [], completedActivityIds: [],
      completedVideoIds: [], activityAnswers: {}, quizAnswers: {},
    })]);
  return db;
};

const submit = async (db, correct = 10, actor = alumno) => (await db.query(
  "SELECT ead_update_aluno_progress($1,$2,'finish_quiz',NULL,$3) AS result",
  [actor, course, JSON.stringify({ answers: answers(correct), quizScore: 100 })],
)).rows[0].result;
const state = async (db) => (await db.query(`SELECT jsonb_build_object(
  'certificates', (SELECT coalesce(jsonb_agg(to_jsonb(ca)),'[]') FROM certificados_academicos ca),
  'documents', (SELECT coalesce(jsonb_agg(to_jsonb(dv)),'[]') FROM documentos_validacao dv),
  'enrollment', (SELECT to_jsonb(m) FROM matriculas m WHERE id = $1),
  'progress', (SELECT progress FROM ead_aluno_progresso WHERE aluno_id = $2 AND curso_id = $3)
) AS result`, [enrollment, alumno, course])).rows[0].result;
const pending = async (db, { modality = 'EAD', status = 'PENDENTE' } = {}) => {
  await db.exec("UPDATE matriculas SET status='CONCLUIDO'");
  await db.query(`UPDATE ead_aluno_progresso SET progress = progress || $1::jsonb`,
    [JSON.stringify({ quizScore: 100, quizAnswers: answers(), completedAt: 1, lastQuizScoreAt: 1 })]);
  await db.query(`INSERT INTO certificados_academicos(
    id,matricula_id,aluno_id,turma_id,curso_id,polo_id,modalidade,status,nota_final,data_conclusao
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,100,'2026-10-01')`,
  [certId, enrollment, alumno, turma, course, unit, modality, status]);
};
const emit = (db) => db.query('SELECT internal_academic.ead_emitir_certificado_automatico($1)', [enrollment]);

test('aprovação real emite EAD na mesma transação, sem livro/página/número ou gestor', async () => {
  const db = await newDatabase();
  try {
    const result = await submit(db);
    const data = await state(db);
    assert.equal(result.summary.quizPassed, true);
    assert.equal(data.certificates.length, 1);
    assert.equal(data.documents.length, 1);
    const certificate = data.certificates[0];
    assert.equal(result.summary.certificateId, certificate.id);
    assert.equal(certificate.status, 'FINALIZADO');
    assert.equal(certificate.nota_final, 100);
    assert.equal(certificate.emitido_por, null);
    for (const field of ['certificado_numero','pagina_livro','livro_registro']) assert.equal(certificate[field], null);
    assert.equal(certificate.emitido_em, data.documents[0].emitido_em);
    assert.equal(data.documents[0].dados_emissao.certificateId, certificate.id);
    assert.equal(data.documents[0].dados_emissao.finalGrade, 100);
    assert.equal(data.enrollment.status, 'CONCLUIDO');
    assert.equal(data.progress.certificateId, certificate.id);
  } finally { await db.close(); }
});

test('nota enviada pelo cliente não libera reprovado; requisitos de aula seguem obrigatórios', async () => {
  const db = await newDatabase();
  const incomplete = await newDatabase({ lessons: false });
  try {
    const result = await submit(db, 6);
    assert.equal(result.summary.quizPassed, false);
    assert.equal(result.summary.certificateId, null);
    assert.equal((await state(db)).certificates.length, 0);
    assert.equal((await state(db)).enrollment.status, 'ATIVO');
    await assert.rejects(submit(incomplete), /Conclua aulas/);
    assert.equal((await state(incomplete)).documents.length, 0);
  } finally { await db.close(); await incomplete.close(); }
});

test('outra identidade e matrícula sem ativação não podem concluir ou emitir', async () => {
  const db = await newDatabase();
  const inactive = await newDatabase({ status: 'PENDENTE' });
  try {
    await assert.rejects(submit(db, 10, other), /próprio aluno/);
    await assert.rejects(submit(inactive), /matrícula ativa ou concluída/);
    const privileges = (await db.query(`SELECT
      has_function_privilege('authenticated', 'internal_academic.ead_emitir_certificado_automatico(uuid)', 'EXECUTE') AS aluno,
      has_function_privilege('service_role', 'internal_academic.ead_emitir_certificado_automatico(uuid)', 'EXECUTE') AS service`)).rows[0];
    assert.deepEqual(privileges, { aluno: false, service: false });
    assert.equal((await state(db)).documents.length, 0);
    await db.exec("SELECT set_config('test.aluno_id','',false)");
    await assert.rejects(submit(db), /próprio aluno/);
    assert.equal((await state(db)).documents.length, 0);
  } finally { await db.close(); await inactive.close(); }
});

test('replay da aprovação preserva integralmente certificado, snapshot, emissão e nota', async () => {
  const db = await newDatabase();
  try {
    await submit(db);
    const before = await state(db);
    await submit(db);
    assert.deepEqual(await state(db), before);
    await assert.rejects(submit(db, 9), /outro conjunto de respostas/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('falha na emissão reverte aprovação, matrícula e criação de certificado', async () => {
  const db = await newDatabase();
  try {
    await db.exec("DELETE FROM documentos_validacao_politicas WHERE documento='certificado_ead'");
    const before = await state(db);
    await assert.rejects(submit(db), /Tipo de documento não permitido/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('legado EAD pendente elegível é liberado sem tocar data de conclusão; cancelado não renasce', async () => {
  const db = await newDatabase();
  const canceled = await newDatabase();
  try {
    await pending(db);
    await emit(db);
    assert.equal((await state(db)).certificates[0].data_conclusao, '2026-10-01');
    await pending(canceled, { status: 'CANCELADO' });
    const before = await state(canceled);
    await assert.rejects(emit(canceled), /pendente sem emissão/);
    assert.deepEqual(await state(canceled), before);
  } finally { await db.close(); await canceled.close(); }
});

test('validação revogada ou expirada impede emissão, inclusive em certificado já finalizado', async () => {
  for (const kind of ['revoked', 'expired']) {
    const db = await newDatabase();
    try {
      await submit(db);
      await db.exec(kind === 'revoked'
        ? "UPDATE documentos_validacao SET status='REVOGADO'"
        : "UPDATE documentos_validacao SET validade_ate='2000-01-01'");
      const before = await state(db);
      await assert.rejects(emit(db), /validação documental ativa/);
      assert.deepEqual(await state(db), before);
      await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
      const pendingState = await state(db);
      await assert.rejects(emit(db), /revogado|expirado/);
      assert.deepEqual(await state(db), pendingState);
    } finally { await db.close(); }
  }
});

test('snapshot ativo reutilizado permanece intacto e divergência exige revisão', async () => {
  const db = await newDatabase();
  try {
    await submit(db);
    const issued = await state(db);
    await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
    await emit(db);
    assert.deepEqual((await state(db)).documents, issued.documents);
    await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
    await db.exec(`UPDATE documentos_validacao SET dados_emissao = dados_emissao || '{"finalGrade":60}'::jsonb`);
    const before = await state(db);
    await assert.rejects(emit(db), /revisão administrativa/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('finalizador de Secretaria preserva autorização e dispensa registro somente para EAD', async () => {
  for (const modality of ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO']) {
    const db = await newDatabase({ modality });
    try {
      await pending(db, { modality });
      await assert.rejects(db.query('SELECT finalizar_certificado_academico($1)', [certId]), /não autorizado/);
      await db.exec("SELECT set_config('test.gestor','true',false)");
      if (modality === 'TECNICO') {
        await assert.rejects(db.query('SELECT finalizar_certificado_academico($1)', [certId]), /número.*página e livro/);
        await db.query("SELECT finalizar_certificado_academico($1,'TEC-1','10','A')", [certId]);
        const cert = (await state(db)).certificates[0];
        assert.equal(cert.certificado_numero, 'TEC-1');
        assert.equal(cert.pagina_livro, '10');
        assert.equal(cert.livro_registro, 'A');
      } else {
        await db.query('SELECT finalizar_certificado_academico($1)', [certId]);
      }
      const cert = (await state(db)).certificates[0];
      assert.equal(cert.status, 'FINALIZADO');
      assert.equal(cert.modalidade, modality);
    } finally { await db.close(); }
  }
});

test('estado do documento é revalidado sob lock mesmo com resposta anterior ATIVO do emissor', async () => {
  const db = await newDatabase();
  try {
    // Simula deterministicamente mudança entre o retorno do emissor e o lock
    // do helper; a emissão real continua sendo executada pelo delegado original.
    await db.exec(`ALTER FUNCTION emitir_documento_validacao_interno(
      text,uuid,text,text,timestamptz,uuid,boolean
    ) RENAME TO emitir_documento_validacao_fixture;
    CREATE FUNCTION emitir_documento_validacao_interno(
      text,uuid,text,text,timestamptz,uuid,boolean
    ) RETURNS TABLE(codigo text,documento text,emitido_em timestamptz,
      ultima_emissao_em timestamptz,validade_ate timestamptz,status text,
      quantidade_emissoes integer,reutilizado boolean)
    LANGUAGE plpgsql AS $$ DECLARE result record; BEGIN
      SELECT * INTO result FROM public.emitir_documento_validacao_fixture($1,$2,$3,$4,$5,$6,$7);
      UPDATE public.documentos_validacao dv SET status='REVOGADO' WHERE dv.codigo=result.codigo;
      RETURN QUERY SELECT result.codigo,result.documento,result.emitido_em,
        result.ultima_emissao_em,result.validade_ate,result.status,
        result.quantidade_emissoes,result.reutilizado;
    END $$;`);
    const before = await state(db);
    await assert.rejects(submit(db), /validação documental não corresponde/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});

test('documento de outro polo nunca é reutilizado para finalizar o EAD', async () => {
  const db = await newDatabase();
  try {
    await submit(db);
    await db.exec("UPDATE certificados_academicos SET status='PENDENTE',codigo_validacao=NULL,emitido_em=NULL");
    await db.query('UPDATE documentos_validacao SET polo_id=$1', [other]);
    const before = await state(db);
    await assert.rejects(emit(db), /validação documental não corresponde/);
    assert.deepEqual(await state(db), before);
  } finally { await db.close(); }
});
