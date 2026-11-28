import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newTrustCertificateDatabase, source, state, scalar, submit, delivery, validate, enrollment,
} from './ead_trust_certificate.fixture.mjs';

const restorationMigration = '20261128134610_restore_original_ead_certificate_codes.sql';
const correctionFunction = 'public.retificar_periodo_certificado_ead(uuid,text,date,text,text,boolean)';
const evidenceFunction = 'public.secretaria_get_ead_certificate_study_evidence(uuid)';

async function prepareCorrectionSchema(db) {
  await db.exec(`
    ALTER TABLE public.parceiros ADD COLUMN nome_mae text;
    ALTER TABLE public.polos ADD COLUMN cnpj text, ADD COLUMN company_id uuid;
    CREATE TABLE public.empresas(id uuid, razao_social text, nome_fantasia text, cnpj text);
    ALTER TABLE public.assinatura_eletronica_envelopes ADD COLUMN documento_validacao_id uuid;
    CREATE FUNCTION public.formatar_matricula_validacao(uuid,timestamptz,uuid)
      RETURNS text LANGUAGE sql AS $$ SELECT 'MATRICULA-SINTETICA'::text $$;
    CREATE FUNCTION internal_academic.ead_historical_study_evidence(uuid) RETURNS jsonb
      LANGUAGE sql AS $$
        SELECT jsonb_build_object('fonte', 'AUDITORIA_PROGRESSO',
          'inicioData', data_conclusao - 7, 'conclusaoData', data_conclusao - 1,
          'referencia', 'PROTOCOLO-SINTETICO')
        FROM public.certificados_academicos WHERE id = $1
      $$;
  `);
  const policy = await source('20260728051634_version_document_validation_public_profiles.sql');
  const helperStart = policy.indexOf('create or replace function public.mascarar_nome_validacao_publica(');
  const helperEnd = policy.indexOf('create or replace function public.filtrar_dados_publicos_validacao(');
  const triggerStart = policy.indexOf('create or replace function public.preparar_snapshot_publico_documento_validacao()');
  const triggerName = 'execute function public.preparar_snapshot_publico_documento_validacao();';
  const triggerEnd = policy.indexOf(triggerName, triggerStart) + triggerName.length;
  await db.exec(policy.slice(helperStart, helperEnd) + policy.slice(triggerStart, triggerEnd));
  const evidence = await source('20261128130030_ead_historical_study_evidence.sql');
  await db.exec(evidence.slice(evidence.indexOf('CREATE FUNCTION public.secretaria_get_ead_certificate_study_evidence('),
    evidence.lastIndexOf('COMMIT;')));
  for (const migration of [
    '20261128130000_ead_study_periods.sql',
    '20261128130040_freeze_ead_certificate_study_period.sql',
    '20261128130050_rectify_ead_certificate_study_period.sql',
    '20261128130051_preserve_ead_rectification_public_snapshot.sql',
  ]) await db.exec(await source(migration));
}

async function performLegacyCorrection(db) {
  await db.query(`UPDATE public.matriculas SET status = 'ATIVO',
    data_matricula = now() - interval '20 days' WHERE id = $1`, [enrollment]);
  await submit(db);
  const before = await state(db);
  const original = before.certificates[0];
  await prepareCorrectionSchema(db);
  const start = await scalar(db, 'SELECT ($1::date - 7)::text value', [original.data_conclusao]);
  const replacementCode = await scalar(db,
    'SELECT public.retificar_periodo_certificado_ead($1,$2,$3,$4,$5,true) value',
    [original.id, original.codigo_validacao, start, 'PROTOCOLO-SINTETICO', 'Período para o teste de restauração']);
  await db.exec(`UPDATE internal_academic.ead_certificate_period_corrections
    SET corrected_at = '2026-11-28 13:29:00+00'`);
  return { before, original, replacementCode };
}

test('restores the complete original certificate and keeps both document snapshots and the correction audit', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    const { before, original, replacementCode } = await performLegacyCorrection(db);
    const prior = await state(db);
    const priorOriginal = prior.documents.find(item => item.codigo === original.codigo_validacao);
    const priorReplacement = prior.documents.find(item => item.codigo === replacementCode);
    const ledger = await scalar(db, 'SELECT to_jsonb(c) value FROM internal_academic.ead_certificate_period_corrections c');
    assert.notEqual(prior.certificates[0].data_conclusao, original.data_conclusao);
    assert.equal((await validate(db, original.codigo_validacao)).status, 'REVOKED');
    assert.equal((await validate(db, replacementCode)).status, 'ACTIVE');

    const priorActor = await scalar(db, 'SELECT auth.uid() value');
    await db.exec("SET test.actor = ''");
    await db.exec(await source(restorationMigration));
    assert.equal(await scalar(db, 'SELECT auth.uid() value'), null);
    await db.query("SELECT set_config('test.actor', $1, false)", [priorActor]);

    const after = await state(db);
    const restored = after.documents.find(item => item.codigo === original.codigo_validacao);
    const retired = after.documents.find(item => item.codigo === replacementCode);
    assert.equal(after.documents.length, 2);
    assert.deepEqual(after.enrollment, before.enrollment);
    assert.deepEqual(after.progress, before.progress);
    assert.deepEqual(after.certificates[0], { ...original, updated_at: after.certificates[0].updated_at });
    assert.deepEqual(restored, {
      ...priorOriginal, identidade: before.documents[0].identidade, status: 'ATIVO',
      revogado_em: null, updated_at: restored.updated_at,
    });
    assert.deepEqual(retired, {
      ...priorReplacement, identidade: `${restored.identidade}:REVOGADO:${retired.id}`, status: 'REVOGADO',
      revogado_em: retired.updated_at, updated_at: retired.updated_at,
    });
    assert.equal((await validate(db, restored.codigo)).status, 'ACTIVE');
    assert.equal((await validate(db, retired.codigo)).status, 'REVOKED');
    assert.equal((await delivery(db, original.id)).code, restored.codigo);
    assert.deepEqual(
      await scalar(db, 'SELECT to_jsonb(c) value FROM internal_academic.ead_certificate_period_corrections c'), ledger);
    assert.equal(await scalar(db, `SELECT count(*)::int value
      FROM internal_academic.ead_certificate_code_restorations r
      WHERE r.previous_document_id = $1 AND r.original_revoked_at = $2
        AND r.operator_session_role = SESSION_USER AND r.operator_effective_role = CURRENT_USER
        AND r.replaced_completion_date = $3 AND r.restored_completion_date = $4`,
    [restored.id, priorOriginal.revogado_em, prior.certificates[0].data_conclusao, original.data_conclusao]), 1);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.deepEqual(await scalar(db,
        "SELECT ARRAY[has_function_privilege($1, $2, 'EXECUTE'), has_function_privilege($1, $3, 'EXECUTE')] value",
        [role, correctionFunction, evidenceFunction]), [false, false]);
    }
    await assert.rejects(
      db.exec('UPDATE internal_academic.ead_certificate_period_corrections SET started_on = started_on'),
      error => error.code === '23514');
  } finally {
    await db.close();
  }
});

test('a diverging correction aborts restoration, audit creation and RPC permission changes together', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    const { original, replacementCode } = await performLegacyCorrection(db);
    await db.exec(`UPDATE public.certificados_academicos
      SET metadados = metadados - 'emissaoAutomaticaEad'`);
    await assert.rejects(db.exec(await source(restorationMigration)), error => error.code === '55000');
    await db.exec('ROLLBACK');
    assert.equal((await validate(db, original.codigo_validacao)).status, 'REVOKED');
    assert.equal((await validate(db, replacementCode)).status, 'ACTIVE');
    assert.equal(await scalar(db, `SELECT to_regclass('internal_academic.ead_certificate_code_restorations') value`), null);
    assert.equal(await scalar(db, 'SELECT has_function_privilege($1, $2, $3) value',
      ['authenticated', correctionFunction, 'EXECUTE']), true);
  } finally {
    await db.close();
  }
});

test('a fresh database retires the old correction RPC without requiring historic data', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    await prepareCorrectionSchema(db);
    await db.exec(await source(restorationMigration));
    assert.equal(await scalar(db, 'SELECT count(*)::int value FROM internal_academic.ead_certificate_code_restorations'), 0);
    assert.equal(await scalar(db, 'SELECT has_function_privilege($1, $2, $3) value',
      ['authenticated', correctionFunction, 'EXECUTE']), false);
  } finally {
    await db.close();
  }
});
