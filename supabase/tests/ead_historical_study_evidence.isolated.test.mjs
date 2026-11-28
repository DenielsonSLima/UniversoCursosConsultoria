import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alumno, enrollment, id, newTrustCertificateDatabase, scalar, source, submit, unit,
} from './ead_trust_certificate.fixture.mjs';

const studentAuth = id(700);
const evidence = (db, certificate) => scalar(db,
  'SELECT public.secretaria_get_ead_certificate_study_evidence($1) AS value', [certificate]);

test('historical evidence follows the student and the approval, using the local day rather than UTC', async () => {
  const db = await newTrustCertificateDatabase();
  try {
    await db.query("UPDATE public.matriculas SET status='ATIVO' WHERE id=$1", [enrollment]);
    await submit(db);
    const certificate = await scalar(db, 'SELECT id AS value FROM public.certificados_academicos');
    const approval = '2026-11-14T01:13:00Z';
    await db.exec(`
      ALTER TABLE public.parceiros ADD COLUMN auth_user_id uuid;
      ALTER TABLE public.ead_aluno_progresso ADD COLUMN id uuid DEFAULT gen_random_uuid();
      CREATE TABLE public.sistema_eventos (
        id uuid PRIMARY KEY, entidade text, entidade_id text, acao text,
        origem text, actor_id uuid, detalhes jsonb, created_at timestamptz
      );
      CREATE OR REPLACE FUNCTION public.can_manage_secretaria_document(text,uuid)
        RETURNS boolean LANGUAGE sql STABLE AS
        $$ SELECT $1 = 'certificado_ead' AND $2 = '${unit}'::uuid
          AND current_setting('test.gestor',true) = 'true' $$;
    `);
    await db.query("UPDATE public.matriculas SET data_matricula='2026-11-11T18:00:00Z' WHERE id=$1", [enrollment]);
    await db.query("UPDATE public.parceiros SET auth_user_id=$1 WHERE id=$2", [studentAuth, alumno]);
    const progressId = await scalar(db, 'SELECT id AS value FROM public.ead_aluno_progresso WHERE aluno_id=$1', [alumno]);
    await db.query("UPDATE public.ead_aluno_progresso SET progress=jsonb_set(progress,'{completedAt}',to_jsonb($1::bigint)) WHERE id=$2",
      [Date.parse(approval), progressId]);
    await db.query(`
      UPDATE public.certificados_academicos SET
        data_inscricao='2026-11-11T18:00:00Z', data_conclusao='2026-11-14',
        created_at=$1, emitido_em=$1 WHERE id=$2
    `, [approval, certificate]);
    await db.exec(await source('20261128130030_ead_historical_study_evidence.sql'));
    const log = (eventId, action, actor, at, changes = ['progress']) => db.query(`
      INSERT INTO public.sistema_eventos VALUES
        ($1,'ead_aluno_progresso',$2,$3,'Auditoria',$4,jsonb_build_object('camposAlterados',$5::jsonb),$6)
    `, [eventId, progressId, action, actor, JSON.stringify(changes), at]);
    await log(id(701), 'Criou', studentAuth, '2026-11-11T18:01:00Z');
    await log(id(702), 'Atualizou', id(800), '2026-11-11T18:02:00Z');
    await log(id(703), 'Atualizou', studentAuth, '2026-11-12T00:00:00Z', ['updated_at']);
    await log(id(704), 'Atualizou', studentAuth, '2026-11-13T00:15:00Z');
    await log(id(705), 'Atualizou', studentAuth, approval);

    assert.equal(await evidence(db, certificate), null, 'A stored approval timestamp requires independent corroboration');
    await db.query(`
      INSERT INTO public.sistema_eventos VALUES
      ($1,'certificados_academicos',$2,'Criou','Auditoria',$3,'{}',$4)
    `, [id(706), certificate, studentAuth, approval]);
    const period = await evidence(db, certificate);
    assert.equal(period.fonte, 'AUDITORIA_PROGRESSO');
    assert.equal(period.inicioData, '2026-11-12');
    assert.equal(period.conclusaoData, '2026-11-13');
    assert.equal(period.referencia, `Auditoria de progresso ${id(704)}`);
    assert.equal(Date.parse(period.concluidoEm), Date.parse(approval));

    await db.exec("SET test.gestor='false'");
    await assert.rejects(evidence(db, certificate), error => error.code === '42501');
    await db.exec("SET test.gestor='true'; SET test.actor=''");
    await assert.rejects(evidence(db, certificate), error => error.code === '42501');
    assert.equal(await scalar(db, "SELECT has_function_privilege('authenticated','internal_academic.ead_historical_study_evidence(uuid)','EXECUTE') AS value"), false);
  } finally {
    await db.close();
  }
});
