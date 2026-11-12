import { readFile } from 'node:fs/promises';
import { confirmationMigrations } from './student-email-confirmation-harness.mjs';
import { installPartnerEmailCorrectionFixture } from './partner-email-correction-harness.mjs';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const migration = name => read(`../../migrations/${name}`);
const block = (sql, name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = sql.indexOf('$function$;', start);
  if (start < 0 || end < 0) throw new Error(`Missing real dependency: ${name}`);
  return sql.slice(start, end + '$function$;'.length);
};
/** Only for an empty disposable PostgreSQL database. Uses the same real guards as the isolated fixture. */
export async function installPartnerEmailCorrectionPostgres(client) {
  const db = { exec: sql => client.query(sql), query: (sql, args) => client.query(sql, args) };
  await db.exec(await read('./student_email_confirmation_schema.sql'));
  const identity = await migration('20260819203143_create_portal_multi_profile_identities.sql');
  for (const name of ['portal_identidade_actor_gestor_contexto', 'portal_identidade_exigir_service_role_actor',
    'portal_identidade_actor_pode_gerir_aluno', 'portal_identidade_termos_versao_vigente']) await db.exec(block(identity, name));
  await db.exec(block(await migration('20260822113000_gate_institutional_first_access.sql'),
    'portal_identidade_institucional_acesso_liberado'));
  for (const name of ['20260824113250_include_responsavel_in_institutional_password_proof.sql',
    '20260824113255_scope_real_password_change_promotion.sql',
    '20260824113000_lock_auth_identity_before_profile_link.sql',
    '20260824113260_lock_shared_credential_promotion.sql',
    '20260824113400_allow_partner_auth_identity_per_profile.sql', ...confirmationMigrations]) await db.exec(await migration(name));
  await db.exec(`CREATE TRIGGER sync_real_student_password AFTER UPDATE OF encrypted_password,email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_aluno_password_reset_completion();
    SELECT set_config('request.jwt.claim.role','service_role',false);`);
  await installPartnerEmailCorrectionFixture(db);
}
