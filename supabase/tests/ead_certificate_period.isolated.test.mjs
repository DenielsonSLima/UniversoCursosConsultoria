import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newTrustCertificateDatabase, source, state, scalar, submit, delivery, validate,
  seedFinancial, grant, pay, enrollment, alumno, id,
} from './ead_trust_certificate.fixture.mjs';

const studyMigration = '20261128130000_ead_study_periods.sql';
const freezeMigration = '20261128130040_freeze_ead_certificate_study_period.sql';
const correctionMigration = '20261128130050_rectify_ead_certificate_study_period.sql';
const correctionSnapshot = '20261128130051_preserve_ead_rectification_public_snapshot.sql';
const auditMigration = '20261128130030_ead_historical_study_evidence.sql';
const modelMigration = '20261128130060_add_period_to_institutional_ead_certificate_model.sql';

async function prepareEnrollment(db) {
  await db.query(`UPDATE public.matriculas SET status='ATIVO',
    data_matricula=statement_timestamp()-interval '20 days' WHERE id=$1`, [enrollment]);
}

async function finishLegacyEnrollment(db) {
  await prepareEnrollment(db);
  await submit(db);
  return (await state(db)).certificates[0];
}

async function applyPublicSnapshotTrigger(db) {
  if (await scalar(db, "SELECT to_regprocedure('public.preparar_snapshot_publico_documento_validacao()') IS NOT NULL value")) return;
  await db.exec(`
    ALTER TABLE public.parceiros ADD COLUMN nome_mae text;
    ALTER TABLE public.polos ADD COLUMN cnpj text, ADD COLUMN company_id uuid;
    CREATE TABLE public.empresas(id uuid, razao_social text, nome_fantasia text, cnpj text);
    CREATE FUNCTION public.formatar_matricula_validacao(uuid,timestamptz,uuid)
      RETURNS text LANGUAGE sql AS $$ SELECT 'MATRICULA-SINTETICA'::text $$;
  `);
  const snapshot = await source('20260728051634_version_document_validation_public_profiles.sql');
  const helpers = snapshot.slice(
    snapshot.indexOf('create or replace function public.mascarar_nome_validacao_publica('),
    snapshot.indexOf('create or replace function public.filtrar_dados_publicos_validacao('),
  );
  const triggerStart = snapshot.indexOf('create or replace function public.preparar_snapshot_publico_documento_validacao()');
  const triggerEnd = snapshot.indexOf('execute function public.preparar_snapshot_publico_documento_validacao();', triggerStart);
  await db.exec(helpers + snapshot.slice(triggerStart,
    triggerEnd + 'execute function public.preparar_snapshot_publico_documento_validacao();'.length));
}

async function applyPeriodMigrations(db) {
  await applyPublicSnapshotTrigger(db);
  for (const migration of [studyMigration, freezeMigration, correctionMigration, correctionSnapshot]) {
    await db.exec(await source(migration));
  }
}

async function correct(db, certificate, start, evidence = 'PROTOCOLO-FIXTURE-001', useAudit = false) {
  return scalar(db, 'SELECT public.retificar_periodo_certificado_ead($1,$2,$3,$4,$5,$6) value',
    [certificate.id, certificate.codigo_validacao, start, evidence, 'Conferência documental do início do estudo', useAudit]);
}

const deterministicStart = db => scalar(db,
  "SELECT ((statement_timestamp() AT TIME ZONE 'America/Maceio')::date - 9)::text value");

test('a new EAD certificate freezes the verified start in calendar days of Sergipe', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    await prepareEnrollment(db);
    await applyPeriodMigrations(db);
    const start = await deterministicStart(db);
    await db.query(`INSERT INTO internal_academic.ead_study_periods
      VALUES ($1, (($2::date + 1)::timestamp AT TIME ZONE 'UTC') + interval '1 hour')`,
    [enrollment, start]);
    await db.exec("SET TIME ZONE 'Pacific/Kiritimati'");
    await submit(db);

    const result = await state(db);
    const certificate = result.certificates[0];
    const completion = await scalar(db,
      "SELECT (statement_timestamp() AT TIME ZONE 'America/Maceio')::date::text value");
    const studyPeriod = { startedOn: start, completedOn: completion, source: 'VERIFIED_STUDY_ACTIVITY' };
    assert.equal(certificate.data_conclusao, completion);
    assert.deepEqual(certificate.metadados.eadStudyPeriod, studyPeriod);
    assert.deepEqual(result.documents[0].dados_emissao.eadStudyPeriod, studyPeriod);
    assert.equal(certificate.emitido_em, result.documents[0].emitido_em);
  } finally {
    await db.close();
  }
});

test('a documentary correction issues once and preserves the prior snapshot and academic conclusion', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    const certificate = await finishLegacyEnrollment(db);
    const before = await state(db);
    await applyPeriodMigrations(db);
    assert.deepEqual((await state(db)).documents, before.documents);
    const start = await deterministicStart(db);
    const newCode = await correct(db, certificate, start);
    assert.notEqual(newCode, certificate.codigo_validacao);
    assert.equal(await correct(db, certificate, start), newCode);
    await assert.rejects(correct(db, certificate, start, 'OUTRA-EVIDENCIA'), error => error.code === '55000');

    const result = await state(db);
    const current = result.certificates[0];
    const original = result.documents.find(item => item.codigo === certificate.codigo_validacao);
    const replacement = result.documents.find(item => item.codigo === newCode);
    const expectedPeriod = { startedOn: start, completedOn: certificate.data_conclusao, source: 'DOCUMENTARY_CORRECTION' };
    assert.equal(result.documents.length, 2);
    assert.deepEqual(result.progress, before.progress);
    assert.equal(current.data_conclusao, certificate.data_conclusao);
    assert.equal(current.nota_final, certificate.nota_final);
    assert.deepEqual(current.metadados.eadStudyPeriod, expectedPeriod);
    assert.deepEqual(original.dados_emissao, before.documents[0].dados_emissao);
    assert.deepEqual(original.dados_publicos_snapshot, before.documents[0].dados_publicos_snapshot);
    assert.deepEqual(replacement.dados_emissao, { ...original.dados_emissao, eadStudyPeriod: expectedPeriod });
    assert.equal((await validate(db, certificate.codigo_validacao)).status, 'REVOKED');
    assert.equal((await validate(db, newCode)).status, 'ACTIVE');
    assert.equal((await delivery(db, certificate.id)).code, newCode);
    assert.deepEqual(await scalar(db, `SELECT jsonb_build_object(
      'original', previous_document_id, 'replacement', replacement_document_id, 'evidence', evidence_reference
    ) value FROM internal_academic.ead_certificate_period_corrections`), {
      original: original.id, replacement: replacement.id, evidence: 'PROTOCOLO-FIXTURE-001',
    });
  } finally {
    await db.close();
  }
});

test('unverified dates and unauthorized corrections leave the original valid', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    const certificate = await finishLegacyEnrollment(db);
    await applyPeriodMigrations(db);
    const start = await deterministicStart(db);
    const before = await state(db);
    await assert.rejects(correct(db, certificate, '1900-01-01'), error => error.code === '22023');
    await assert.rejects(correct(db, certificate, '2100-01-01'), error => error.code === '22023');
    await assert.rejects(correct(db, certificate, start, ''), error => error.code === '22023');
    await db.exec("SET test.gestor='false'");
    await assert.rejects(correct(db, certificate, start), error => error.code === '42501');
    assert.deepEqual((await state(db)).documents, before.documents);
    assert.equal((await validate(db, certificate.codigo_validacao)).status, 'ACTIVE');
  } finally {
    await db.close();
  }
});

test('retification revalidates actual progress audit and corrects the documented UTC conclusion day', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    const certificate = await finishLegacyEnrollment(db);
    const enrollmentAt = '2026-11-11T18:00:00Z';
    const firstStudyAt = '2026-11-13T00:15:00Z';
    const approvalAt = '2026-11-14T01:13:00Z';
    await db.exec(`
      ALTER TABLE public.parceiros ADD COLUMN auth_user_id uuid;
      ALTER TABLE public.ead_aluno_progresso ADD COLUMN id uuid DEFAULT gen_random_uuid();
      CREATE TABLE public.sistema_eventos (
        id uuid PRIMARY KEY, entidade text, entidade_id text, acao text, origem text,
        actor_id uuid, detalhes jsonb, created_at timestamptz
      );
    `);
    await db.query("UPDATE public.matriculas SET data_matricula=$1 WHERE id=$2", [enrollmentAt, enrollment]);
    const studentAuth = id(750);
    await db.query("UPDATE public.parceiros SET auth_user_id=$1 WHERE id=$2", [studentAuth, alumno]);
    const progressId = await scalar(db, "SELECT id value FROM public.ead_aluno_progresso WHERE aluno_id=$1", [alumno]);
    await db.query("UPDATE public.ead_aluno_progresso SET progress=jsonb_set(progress,'{completedAt}',to_jsonb($1::bigint)) WHERE id=$2",
      [Date.parse(approvalAt), progressId]);
    await db.query(`UPDATE public.certificados_academicos SET data_inscricao=$1, data_conclusao='2026-11-14',
      emitido_em=$2, created_at=$2 WHERE id=$3`, [enrollmentAt, approvalAt, certificate.id]);
    await db.query(`UPDATE public.documentos_validacao SET
      dados_emissao=dados_emissao||'{"completionDate":"2026-11-14"}'::jsonb WHERE codigo=$1`, [certificate.codigo_validacao]);
    await db.query(`INSERT INTO public.sistema_eventos VALUES
      ($1,'ead_aluno_progresso',$2,'Atualizou','Auditoria',$3,'{"camposAlterados":["progress"]}',$4),
      ($5,'certificados_academicos',$6,'Criou','Auditoria',$3,'{}',$7)`,
      [id(751), progressId, studentAuth, firstStudyAt, id(752), certificate.id, approvalAt]);
    await db.exec(await source(auditMigration));
    await applyPeriodMigrations(db);

    const evidence = await scalar(db, "SELECT public.secretaria_get_ead_certificate_study_evidence($1) value", [certificate.id]);
    const original = (await state(db)).documents[0];
    await assert.rejects(correct(db, certificate, evidence.inicioData, 'Identificador divergente', true),
      error => error.code === '55000');
    const newCode = await correct(db, certificate, evidence.inicioData, evidence.referencia, true);
    assert.equal(await correct(db, certificate, evidence.inicioData, evidence.referencia, true), newCode);
    const result = await state(db);
    assert.equal(result.certificates[0].data_conclusao, '2026-11-13');
    assert.equal(result.certificates[0].metadados.eadStudyPeriod.startedOn, '2026-11-12');
    assert.deepEqual(result.documents.find(item => item.id === original.id).dados_emissao, original.dados_emissao);
    assert.equal(result.documents.find(item => item.codigo === newCode).dados_emissao.completionDate, '2026-11-13');
    assert.equal(await scalar(db, "SELECT evidence_source value FROM internal_academic.ead_certificate_period_corrections"),
      'AUDITORIA_PROGRESSO');
  } finally {
    await db.close();
  }
});

test('the real public snapshot trigger preserves historical field limits through a replacement', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    await applyPublicSnapshotTrigger(db);
    await db.exec(`UPDATE public.documentos_validacao_politicas SET versao=2,
      campos_publicos=ARRAY['courseName','issuedAt'] WHERE documento='certificado_ead'`);
    const certificate = await finishLegacyEnrollment(db);
    await applyPeriodMigrations(db);
    await db.exec(`UPDATE public.documentos_validacao_politicas SET versao=3,
      campos_publicos=ARRAY['courseName','issuedAt','studentName'] WHERE documento='certificado_ead'`);
    const start = await deterministicStart(db);
    const newCode = await correct(db, certificate, start);
    const result = await state(db);
    const previous = result.documents.find(item => item.codigo === certificate.codigo_validacao);
    const replacement = result.documents.find(item => item.codigo === newCode);
    assert.equal(replacement.politica_versao_emissao, 2);
    assert.deepEqual(replacement.campos_publicos_emissao, ['courseName', 'issuedAt']);
    assert.deepEqual(replacement.dados_publicos_snapshot, {
      ...previous.dados_publicos_snapshot, issuedAt: replacement.emitido_em,
    });
    assert.equal((await validate(db, newCode)).studentName, undefined);

    await db.query(`UPDATE public.documentos_validacao SET dados_publicos_snapshot='{"studentName":"INCORRETO"}',
      campos_publicos_emissao=ARRAY['studentName'] WHERE codigo=$1`, [newCode]);
    assert.deepEqual((await state(db)).documents.find(item => item.codigo === newCode).dados_publicos_snapshot,
      replacement.dados_publicos_snapshot);

    await db.exec("UPDATE public.documentos_validacao_politicas SET validacao_publica=false WHERE documento='certificado_ead'");
    const earlier = await scalar(db, 'SELECT ($1::date-1)::text value', [start]);
    const privateCode = await correct(db, result.certificates[0], earlier);
    assert.equal(await validate(db, privateCode), null);
  } finally {
    await db.close();
  }
});

test('a definitive trust certificate can be corrected after its payment, while temporary delivery cannot', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    await db.query("UPDATE public.matriculas SET data_matricula=now()-interval '20 days' WHERE id=$1", [enrollment]);
    await seedFinancial(db, { managed: true });
    await grant(db);
    await submit(db);
    const certificate = (await state(db)).certificates[0];
    await applyPeriodMigrations(db);
    const start = await deterministicStart(db);
    await assert.rejects(correct(db, certificate, start), error => error.code === '55000');
    await pay(db, { managed: true });
    const newCode = await correct(db, certificate, start);
    assert.deepEqual(await delivery(db, certificate.id), {
      state: 'DEFINITIVE', deadline: null, allowed: true, code: newCode,
    });
    assert.equal((await validate(db, certificate.codigo_validacao)).status, 'REVOKED');
  } finally {
    await db.close();
  }
});

test('the persisted institutional model gains dates while other styles, blocks and models remain identical', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    const model = {
      id: 'certificado_ead', textoFrente: 'Texto oficial da instituição',
      landscapeWatermarkOpacity: 0.24, bgFrenteUrl: 'synthetic-custom-background',
      blocks: [
        { id: 'texto', type: 'text', x: 19.26, y: 27.09, width: 790, fontSize: 23, visible: true, content: 'Texto personalizado' },
        { id: 'cidadeData', type: 'text', content: '{{cidade_uf}}, {{data_conclusao}}' },
        { id: 'versoDataTexto', type: 'text', content: '{{cidade_uf}}, {{data_conclusao_extenso}}.' },
        { id: 'assinatura1', type: 'signature', x: 39, signatureSource: 'diretoriaGeral' },
      ],
    };
    const separateModel = { id: 'outro', textoFrente: 'Outro documento' };
    await db.query("UPDATE public.documentos_templates SET conteudo=$1::jsonb WHERE id='diplomas'",
      [JSON.stringify([model, separateModel])]);
    await db.exec(await source(modelMigration));
    const read = () => scalar(db, "SELECT conteudo value FROM public.documentos_templates WHERE id='diplomas'");
    const after = await read();
    const suffix = '<br />Período de realização · {{periodo}}.';
    assert.deepEqual(after, [{
      ...model,
      textoFrente: model.textoFrente + suffix,
      blocks: [
        { ...model.blocks[0], content: model.blocks[0].content + suffix },
        { ...model.blocks[1], content: '{{cidade_uf}}, {{data_emissao}}', eadLegacyDateContent: model.blocks[1].content },
        { ...model.blocks[2], content: '{{cidade_uf}}, {{data_emissao_extenso}}.', eadLegacyDateContent: model.blocks[2].content },
        model.blocks[3],
      ],
    }, separateModel]);
    await db.exec(await source(modelMigration));
    assert.deepEqual(await read(), after);
  } finally {
    await db.close();
  }
});
