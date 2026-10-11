import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const migration = name => read(`../../migrations/${name}`);
const block = (sql, name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = sql.indexOf('$function$;', start);
  if (start < 0 || end < 0) throw new Error(`Função real ausente: ${name}`);
  return sql.slice(start, end + '$function$;'.length);
};

export const confirmationMigrations = [
  '20261010193000_confirm_student_email_atomically.sql',
  '20261010193100_preserve_created_student_password.sql',
  '20261010193200_require_password_proof_on_email_confirmation.sql',
  '20261011123000_revalidate_student_temporary_password_reservation_actor.sql',
];

export async function createStudentEmailDatabase() {
  const packageName = process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
    : '@electric-sql/pglite';
  const { PGlite } = await import(packageName);
  const db = new PGlite();
  try {
    await db.exec(await read('./student_email_confirmation_schema.sql'));
    const identity = await migration('20260819203143_create_portal_multi_profile_identities.sql');
    for (const name of [
      'portal_identidade_actor_gestor_contexto',
      'portal_identidade_exigir_service_role_actor',
      'portal_identidade_actor_pode_gerir_aluno',
      'portal_identidade_termos_versao_vigente',
    ]) await db.exec(block(identity, name));
    await db.exec(block(await migration('20260822113000_gate_institutional_first_access.sql'),
      'portal_identidade_institucional_acesso_liberado'));
    for (const name of [
      '20260824113250_include_responsavel_in_institutional_password_proof.sql',
      '20260824113255_scope_real_password_change_promotion.sql',
      '20260824113000_lock_auth_identity_before_profile_link.sql',
      '20260824113260_lock_shared_credential_promotion.sql',
      '20260824113400_allow_partner_auth_identity_per_profile.sql',
      ...confirmationMigrations,
    ]) await db.exec(await migration(name));
    await db.exec(`CREATE TRIGGER sync_real_student_password
      AFTER UPDATE OF encrypted_password, email_confirmed_at ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.sync_aluno_password_reset_completion();
      SELECT set_config('request.jwt.claim.role','service_role',false);`);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  actorRecord: '11111111-1111-4111-8111-111111111112',
  student: '22222222-2222-4222-8222-222222222222',
  auth: '33333333-3333-4333-8333-333333333333',
  other: '44444444-4444-4444-8444-444444444444',
  polo: '55555555-5555-4555-8555-555555555555',
  issuance: '66666666-6666-4666-8666-666666666666',
};

export async function seedStudentEmailDatabase(db) {
  await db.exec(`INSERT INTO public.usuarios_sistema(id,auth_user_id,nome,email)
    VALUES ('${ids.actorRecord}','${ids.actor}','Gestor sintético','gestor@example.com');
    INSERT INTO auth.users(id,email,encrypted_password,confirmation_token,recovery_token,
      raw_app_meta_data,raw_user_meta_data)
    VALUES ('${ids.auth}','aluno@example.com','opaque-existing-hash','confirmation-fixture',
      'recovery-fixture','{"provider":"email","custom":"preservar"}',
      '{"email_verified":false,"custom":"preservar"}');
    INSERT INTO public.parceiros(id,auth_user_id,email,auth_login_email,cpf_cnpj,polo_id,
      email_validado_gestor_em,senha_atualizada_em)
    VALUES ('${ids.student}','${ids.auth}','aluno@example.com','aluno@example.com',
      '52998224725','${ids.polo}','2026-10-01','2026-10-02');
    INSERT INTO public.portal_identidade_institucional_senha_eventos VALUES ('${ids.auth}','2026-10-02');
    INSERT INTO auth.one_time_tokens VALUES
      ('00000000-0000-4000-8000-000000000001','${ids.auth}','confirmation_token','confirmation-fixture'),
      ('00000000-0000-4000-8000-000000000002','${ids.auth}','recovery_token','recovery-fixture');
    INSERT INTO auth.sessions VALUES ('00000000-0000-4000-8000-000000000003','${ids.auth}');`);
}
