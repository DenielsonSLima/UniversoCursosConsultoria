import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createStudentEmailDatabase, seedStudentEmailDatabase, ids,
} from './fixtures/student-email-confirmation-harness.mjs';

const confirm = (db, options = {}) => db.query(`
  SELECT public.portal_validar_email_aluno_por_gestor($1::uuid,$2::uuid,$3::uuid,$4::text) AS ok`, [
  options.student ?? ids.student, options.actor ?? ids.actor,
  options.auth ?? ids.auth, options.email ?? 'aluno@example.com',
]);
const reserve = db => db.query(`
  SELECT public.portal_reservar_emissao_senha_temporaria($1::uuid,$2::uuid,$3::uuid)`, [
  ids.student, ids.issuance, ids.actor,
]);
const one = async (db, sql) => (await db.query(sql)).rows[0];
const rejectsCode = (operation, code) => assert.rejects(operation, error => error.code === code);
const isolated = async callback => {
  const db = await createStudentEmailDatabase();
  try {
    await seedStudentEmailDatabase(db);
    await callback(db);
  } finally { await db.close(); }
};
const preserved = db => one(db, `SELECT
  usuario.encrypted_password, usuario.raw_app_meta_data, usuario.raw_user_meta_data,
  usuario.recovery_token, usuario.invited_at,
  aluno.aceitou_termos_uso, aluno.aceitou_termos_uso_em, aluno.termos_uso_versao,
  aluno.email_validado_gestor_em,
  (SELECT count(*)::int FROM auth.sessions) AS sessions,
  (SELECT count(*)::int FROM auth.one_time_tokens WHERE token_type='recovery_token') AS recovery_otp
  FROM auth.users AS usuario JOIN public.parceiros AS aluno ON aluno.auth_user_id=usuario.id
  WHERE aluno.id='${ids.student}'`);

test('RPC confirma stamp legado e reutiliza senha própria mantendo metadata, recuperação, sessão e termos', () => isolated(async db => {
  const before = await preserved(db);
  assert.equal((await confirm(db)).rows[0].ok, true);
  assert.deepEqual(await preserved(db), before);
  assert.deepEqual(await one(db, `SELECT email_confirmed_at IS NOT NULL AS confirmed,
    confirmation_token='' AS token_cleared FROM auth.users WHERE id='${ids.auth}'`), {
    confirmed: true, token_cleared: true,
  });
  assert.deepEqual(await one(db, `SELECT acesso_status, troca_senha_obrigatoria,
    senha_atualizada_em IS NOT NULL AS password_proof, aceitou_termos_uso
    FROM public.parceiros WHERE id='${ids.student}'`), {
    acesso_status: 'ativo', troca_senha_obrigatoria: false,
    password_proof: true, aceitou_termos_uso: false,
  });
  assert.equal((await one(db, `SELECT count(*)::int AS n FROM auth.one_time_tokens
    WHERE token_type='confirmation_token'`)).n, 0);
  assert.equal((await one(db, 'SELECT count(*)::int AS n FROM public.sistema_eventos')).n, 1);
  const completed = await one(db, `SELECT usuario.email_confirmed_at, aluno.senha_atualizada_em
    FROM auth.users usuario JOIN public.parceiros aluno ON aluno.auth_user_id=usuario.id
    WHERE aluno.id='${ids.student}'`);
  await confirm(db);
  assert.deepEqual(await one(db, `SELECT usuario.email_confirmed_at, aluno.senha_atualizada_em
    FROM auth.users usuario JOIN public.parceiros aluno ON aluno.auth_user_id=usuario.id
    WHERE aluno.id='${ids.student}'`), completed);
  assert.equal((await one(db, 'SELECT count(*)::int AS n FROM public.sistema_eventos')).n, 1);
}));

test('validação nova registra evidência uma vez e libera confirmação sem criar senha', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET email_validado_gestor_em=NULL, senha_atualizada_em=NULL;
    DELETE FROM public.portal_identidade_institucional_senha_eventos;
    UPDATE auth.users SET invited_at='2026-10-01';`);
  const before = await one(db, `SELECT encrypted_password, raw_user_meta_data,
    raw_app_meta_data, recovery_token FROM auth.users WHERE id='${ids.auth}'`);
  await confirm(db);
  assert.deepEqual(await one(db, `SELECT encrypted_password, raw_user_meta_data,
    raw_app_meta_data, recovery_token FROM auth.users WHERE id='${ids.auth}'`), before);
  assert.deepEqual(await one(db, `SELECT email_validado_gestor_em IS NOT NULL AS validated,
    acesso_status, troca_senha_obrigatoria, senha_atualizada_em, aceitou_termos_uso
    FROM public.parceiros WHERE id='${ids.student}'`), {
    validated: true, acesso_status: 'pendente', troca_senha_obrigatoria: true,
    senha_atualizada_em: null, aceitou_termos_uso: false,
  });
}));

test('confirmação de conta sem hash não inventa prova de senha nem aceite', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET senha_atualizada_em=NULL;
    DELETE FROM public.portal_identidade_institucional_senha_eventos;
    UPDATE auth.users SET encrypted_password='';`);
  await confirm(db);
  assert.deepEqual(await one(db, `SELECT senha_atualizada_em, troca_senha_obrigatoria,
    aceitou_termos_uso FROM public.parceiros WHERE id='${ids.student}'`), {
    senha_atualizada_em: null, troca_senha_obrigatoria: true, aceitou_termos_uso: false,
  });
}));

test('timestamp isolado ou ledger anterior ao convite não libera hash de convite', () => isolated(async db => {
  await db.exec(`UPDATE auth.users SET invited_at='2026-10-03';
    DELETE FROM public.portal_identidade_institucional_senha_eventos;`);
  await confirm(db);
  assert.deepEqual(await one(db, `SELECT acesso_status,troca_senha_obrigatoria
    FROM public.parceiros WHERE id='${ids.student}'`), {
    acesso_status: 'pendente', troca_senha_obrigatoria: true,
  });
  await db.exec(`UPDATE auth.users SET email_confirmed_at=NULL;
    INSERT INTO public.portal_identidade_institucional_senha_eventos VALUES ('${ids.auth}','2026-10-02');`);
  await confirm(db);
  assert.equal((await one(db, `SELECT troca_senha_obrigatoria FROM public.parceiros`)).troca_senha_obrigatoria, true);
}));

test('signup público canônico já recebeu a senha própria e não exige recriá-la', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET senha_atualizada_em=NULL;
    DELETE FROM public.portal_identidade_institucional_senha_eventos;
    UPDATE auth.users SET invited_at=NULL,raw_user_meta_data=
      '{"origem":"cadastro_publico_ead","tipo":"Aluno","cpf":"52998224725"}';`);
  await confirm(db);
  assert.deepEqual(await one(db, `SELECT acesso_status,troca_senha_obrigatoria,
    aceitou_termos_uso FROM public.parceiros WHERE id='${ids.student}'`), {
    acesso_status: 'ativo', troca_senha_obrigatoria: false, aceitou_termos_uso: false,
  });
}));

test('nova senha própria simultânea e reconfirmação de conta pronta continuam válidas', () => isolated(async db => {
  await db.exec(`DELETE FROM public.portal_identidade_institucional_senha_eventos;
    UPDATE public.parceiros SET senha_atualizada_em=NULL;
    UPDATE auth.users SET encrypted_password='opaque-new-hash',email_confirmed_at=now();`);
  assert.equal((await one(db, `SELECT troca_senha_obrigatoria FROM public.parceiros`)).troca_senha_obrigatoria, false);
  await db.exec(`UPDATE auth.users SET email_confirmed_at=now();`);
  assert.equal((await one(db, `SELECT troca_senha_obrigatoria FROM public.parceiros`)).troca_senha_obrigatoria, false);
}));

test('perfil Professor compatível compartilha senha comprovada, mantendo termos do Aluno pendentes', () => isolated(async db => {
  await db.exec(`INSERT INTO public.parceiros(id,tipo,auth_user_id,email,auth_login_email,cpf_cnpj)
    VALUES ('${ids.other}','Professor','${ids.auth}','aluno@example.com','aluno@example.com','52998224725');`);
  const before = await preserved(db);
  await confirm(db);
  assert.deepEqual(await preserved(db), before);
  assert.equal((await one(db, `SELECT primeiro_acesso_institucional_pendente
    FROM public.parceiros WHERE id='${ids.other}'`)).primeiro_acesso_institucional_pendente, false);
}));

test('vínculo civil divergente legado bloqueia RPC sem confirmar ou alterar provas', () => isolated(async db => {
  await db.exec(`ALTER TABLE public.responsaveis_legais DISABLE TRIGGER ALL;
    INSERT INTO public.responsaveis_legais(id,auth_user_id,email,cpf_normalizado)
    VALUES ('${ids.other}','${ids.auth}','aluno@example.com','00000000000');
    ALTER TABLE public.responsaveis_legais ENABLE TRIGGER ALL;`);
  const before = await preserved(db);
  await rejectsCode(() => confirm(db), '23514');
  assert.deepEqual(await preserved(db), before);
  assert.equal((await one(db, `SELECT email_confirmed_at IS NULL AS pending FROM auth.users`)).pending, true);
}));

test('fence persistido do Responsável bloqueia confirmação do UID compartilhado', () => isolated(async db => {
  await db.exec(`INSERT INTO public.responsaveis_legais(id,auth_user_id,email,cpf_normalizado,
    senha_temporaria_pendente,senha_temporaria_emissao_id,senha_temporaria_emissao_iniciada_em)
    VALUES ('${ids.other}','${ids.auth}','aluno@example.com','52998224725',true,'${ids.issuance}',now());`);
  await rejectsCode(() => confirm(db), '55000');
  assert.equal((await one(db, `SELECT senha_temporaria_emissao_id FROM public.responsaveis_legais`)).senha_temporaria_emissao_id,
    ids.issuance);
}));

test('assinatura antiga deixa de existir e nenhum snapshot é opcional', () => isolated(async db => {
  assert.equal((await one(db, `SELECT
    to_regprocedure('public.portal_validar_email_aluno_por_gestor(uuid,uuid)') IS NULL AS absent`)).absent, true);
  assert.deepEqual(await one(db, `SELECT pronargdefaults,
    has_function_privilege('anon',oid,'EXECUTE') AS anon_allowed,
    has_function_privilege('authenticated',oid,'EXECUTE') AS user_allowed,
    has_function_privilege('service_role',oid,'EXECUTE') AS server_allowed
    FROM pg_proc WHERE oid='public.portal_validar_email_aluno_por_gestor(uuid,uuid,uuid,text)'::regprocedure`), {
    pronargdefaults: 0, anon_allowed: false, user_allowed: false, server_allowed: true,
  });
  await rejectsCode(() => db.query(`SELECT public.portal_validar_email_aluno_por_gestor(
    $1::uuid,$2::uuid,NULL,'aluno@example.com')`, [ids.student,ids.actor]), '22023');
}));

test('replay continua exigindo ator autorizado e polo atual', () => isolated(async db => {
  await confirm(db);
  await db.exec(`UPDATE public.usuarios_sistema SET permissoes='{"modules":["parceiros"],"allPolos":false}';`);
  await rejectsCode(() => confirm(db), '42501');
  await db.exec(`UPDATE public.usuarios_sistema SET status='Inativo';`);
  await rejectsCode(() => confirm(db), '42501');
  await db.exec(`SELECT set_config('request.jwt.claim.role','authenticated',false);`);
  await rejectsCode(() => confirm(db), '42501');
  assert.equal((await one(db, 'SELECT count(*)::int AS n FROM public.sistema_eventos')).n, 1);
}));

test('mudança de contexto na releitura do gestor aborta antes de registrar ou confirmar', () => isolated(async db => {
  await db.exec(`CREATE SEQUENCE public.actor_context_reads;
    CREATE OR REPLACE FUNCTION public.portal_identidade_actor_gestor_contexto(p_actor_auth_user_id uuid)
    RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
      SELECT CASE WHEN nextval('public.actor_context_reads')=1
        THEN '{"allPolos":true,"poloIds":[]}'::jsonb
        ELSE '{"allPolos":false,"poloIds":[]}'::jsonb END;
    $$;`);
  const before = await preserved(db);
  await rejectsCode(() => confirm(db), '42501');
  assert.deepEqual(await preserved(db), before);
  assert.equal((await one(db, `SELECT email_confirmed_at IS NULL AS pending FROM auth.users`)).pending, true);
  assert.equal((await one(db, 'SELECT count(*)::int AS n FROM public.sistema_eventos')).n, 0);
}));

test('UUID ou e-mail obsoleto não confirma outra identidade', () => isolated(async db => {
  for (const options of [{ auth: ids.other }, { email: 'outro@example.com' }]) {
    await rejectsCode(() => confirm(db, options), '40001');
  }
  await db.exec(`UPDATE auth.users SET email='outro@example.com';`);
  await rejectsCode(() => confirm(db), '40001');
  assert.equal((await one(db, `SELECT email_confirmed_at IS NULL AS pending
    FROM auth.users WHERE id='${ids.auth}'`)).pending, true);
  assert.equal((await one(db, 'SELECT count(*)::int AS n FROM public.sistema_eventos')).n, 0);
}));

test('perfis inativos ou outro tipo não usam a permissão global para confirmar', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET status='Inativo';`);
  await rejectsCode(() => confirm(db), '23514');
  await db.exec(`UPDATE public.parceiros SET status='Ativo',tipo='Professor';`);
  await rejectsCode(() => confirm(db), '23514');
}));

test('fence Auth de aluno ou responsável bloqueia confirmação sem limpar emissão', () => isolated(async db => {
  for (const key of [
    'universocc_temporary_password_issue_id', 'universocc_temporary_password_write_nonce',
    'universocc_responsavel_temporary_password_issue_id', 'universocc_responsavel_temporary_password_write_nonce',
  ]) {
    await db.query(`UPDATE auth.users SET raw_app_meta_data=jsonb_build_object($1::text,$2::text)
      WHERE id=$3::uuid`, [key,ids.issuance,ids.auth]);
    await rejectsCode(() => confirm(db), '55000');
    assert.equal((await one(db, `SELECT email_confirmed_at IS NULL AS pending
      FROM auth.users WHERE id='${ids.auth}'`)).pending, true);
  }
}));

test('fence do perfil bloqueia confirmação e deixa reserva recuperável', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET senha_temporaria_pendente=true,
    senha_temporaria_emissao_id='${ids.issuance}',senha_temporaria_emissao_iniciada_em=now();`);
  await rejectsCode(() => confirm(db), '55000');
  assert.equal((await one(db, `SELECT senha_temporaria_emissao_id FROM public.parceiros`)).senha_temporaria_emissao_id,
    ids.issuance);
  assert.equal((await one(db, `SELECT count(*)::int AS n FROM auth.one_time_tokens`)).n, 2);
}));

test('falha de auditoria reverte confirmação, token, promoção e novo stamp na mesma transação', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET email_validado_gestor_em=NULL;
    CREATE FUNCTION public.fail_confirmation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Falha sintética de auditoria'; END; $$;
    CREATE TRIGGER fail_audit BEFORE INSERT ON public.sistema_eventos
      FOR EACH ROW EXECUTE FUNCTION public.fail_confirmation_audit();`);
  const before = await preserved(db);
  await rejectsCode(() => confirm(db), 'P0001');
  assert.deepEqual(await preserved(db), before);
  assert.deepEqual(await one(db, `SELECT email_confirmed_at IS NULL AS pending,
    confirmation_token='confirmation-fixture' AS token_preserved FROM auth.users`), {
    pending: true, token_preserved: true,
  });
  assert.equal((await one(db, 'SELECT count(*)::int AS n FROM auth.one_time_tokens')).n, 2);
  assert.equal((await one(db, 'SELECT troca_senha_obrigatoria FROM public.parceiros')).troca_senha_obrigatoria, true);
}));

test('reserva rejeita senha própria com e-mail ou termos pendentes e preserva todos os estados', () => isolated(async db => {
  const before = await preserved(db);
  await rejectsCode(() => reserve(db), '55000');
  assert.deepEqual(await preserved(db), before);
  await confirm(db);
  await rejectsCode(() => reserve(db), '55000');
  assert.equal((await one(db, `SELECT senha_temporaria_emissao_id IS NULL AS no_issue
    FROM public.parceiros`)).no_issue, true);
}));

test('senha temporária ainda vigente admite reserva, mas senha posterior própria não admite', () => isolated(async db => {
  await db.exec(`DELETE FROM public.portal_identidade_institucional_senha_eventos;
    UPDATE public.parceiros SET senha_temporaria_pendente=true,
      senha_temporaria_emitida_em='2026-10-03',senha_atualizada_em='2026-10-03';`);
  assert.equal((await reserve(db)).rows[0].portal_reservar_emissao_senha_temporaria, true);
  await db.exec(`UPDATE public.parceiros SET senha_temporaria_emissao_id=NULL,
    senha_temporaria_emissao_iniciada_em=NULL,senha_temporaria_emitida_em='2026-10-03',
    senha_atualizada_em='2026-10-04';`);
  await rejectsCode(() => reserve(db), '55000');
}));

test('contrato usa locks sem espera nas duas linhas e advisories compartilhadas', async () => {
  const sql = await readFile(new URL('../migrations/20261010193000_confirm_student_email_atomically.sql', import.meta.url), 'utf8');
  assert.equal((sql.match(/FOR UPDATE NOWAIT/g) || []).length, 2);
  assert.match(sql, /FOR SHARE NOWAIT/);
  assert.match(sql, /pg_try_advisory_xact_lock/);
  assert.match(sql, /portal-temporary-password-auth:/);
  assert.match(sql, /portal-auth-identity:/);
  assert.doesNotMatch(sql, /pg_advisory_xact_lock\(/);
});
