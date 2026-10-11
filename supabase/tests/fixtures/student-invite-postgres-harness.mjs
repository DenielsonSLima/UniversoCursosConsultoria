// Synthetic schema and the versioned SQL used by the actual Auth/CAS contract.
import { readFile } from 'node:fs/promises';
import {
  confirmationMigrations, ids, seedStudentEmailDatabase,
} from './student-email-confirmation-harness.mjs';

export { ids };
const migration = name => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
const block = (sql, name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = sql.indexOf('$function$;', start);
  if (start < 0 || end < 0) throw new Error(`Missing versioned function: ${name}`);
  return sql.slice(start, end + '$function$;'.length);
};

export async function loadStudentInvitePostgres(db) {
  await db.query(await readFile(new URL('./student_email_confirmation_schema.sql', import.meta.url), 'utf8'));
  const initial = await migration('20260819203143_create_portal_multi_profile_identities.sql');
  for (const name of [
    'portal_identidade_actor_gestor_contexto', 'portal_identidade_exigir_service_role_actor',
    'portal_identidade_actor_pode_gerir_aluno', 'portal_identidade_termos_versao_vigente',
  ]) await db.query(block(initial, name));
  await db.query(block(await migration('20260822113000_gate_institutional_first_access.sql'),
    'portal_identidade_institucional_acesso_liberado'));
  await db.query(block(await migration('20260822113020_close_institutional_gate_bypasses.sql'),
    'portal_identidade_actor_gestor_contexto'));
  for (const name of [
    '20260824113250_include_responsavel_in_institutional_password_proof.sql',
    '20260824113255_scope_real_password_change_promotion.sql',
    '20260824113000_lock_auth_identity_before_profile_link.sql',
    '20260824113260_lock_shared_credential_promotion.sql',
    '20260824113400_allow_partner_auth_identity_per_profile.sql',
    ...confirmationMigrations,
  ]) await db.query(await migration(name));
  await db.query(`CREATE TRIGGER sync_real_student_password
    AFTER UPDATE OF encrypted_password, email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_aluno_password_reset_completion();
    ALTER TABLE public.parceiros ADD COLUMN convite_enviado_em timestamptz;
    SELECT set_config('request.jwt.claim.role','service_role',false);`);
  await seedStudentEmailDatabase({ exec: sql => db.query(sql), query: (sql, args) => db.query(sql, args) });
  await db.query(`UPDATE public.usuarios_sistema
    SET primeiro_acesso_institucional_pendente=false, acesso_institucional_origem='LEGADO';
    UPDATE auth.users SET email_confirmed_at='2026-10-01' WHERE id='${ids.auth}';
    UPDATE public.parceiros SET senha_atualizada_em=NULL, troca_senha_obrigatoria=true,
      acesso_status='pendente' WHERE id='${ids.student}';
    DELETE FROM public.portal_identidade_institucional_senha_eventos WHERE auth_user_id='${ids.auth}';`);
  await db.query(await migration('20261011160000_guard_student_invite_actor_cas.sql'));
}

const fields = [
  'tipo', 'status', 'email', 'cpf_cnpj', 'polo_id', 'polo_ids', 'auth_user_id',
  'auth_login_email', 'acesso_status', 'troca_senha_obrigatoria', 'senha_atualizada_em',
  'senha_temporaria_pendente', 'senha_temporaria_emitida_em', 'senha_temporaria_emissao_id',
  'senha_temporaria_emissao_iniciada_em', 'senha_temporaria_emissao_senha_alterada_em',
  'acesso_ativado_em', 'convite_enviado_em', 'aceitou_termos_uso', 'termos_uso_versao',
];
export const snapshot = row => Object.fromEntries(fields.map(key => [key, row[key] ?? null]));
export const studentRow = async db => (await db.query(
  'SELECT to_jsonb(p) AS row FROM public.parceiros p WHERE id=$1', [ids.student])).rows[0].row;
export const invokeCas = async (db, expected, patch = {}) => {
  // Exercise the actual EXECUTE grant, rather than relying on the fixture owner.
  await db.query('SET ROLE service_role');
  try {
    return (await db.query(`SELECT public.portal_atualizar_acesso_aluno_por_gestor_cas(
      $1,$2,$3::jsonb,$4::jsonb) AS row`,
    [ids.actor, ids.student, JSON.stringify(expected), JSON.stringify(patch)])).rows[0].row;
  } finally {
    // A failed explicit transaction must be rolled back by its scenario first.
    await db.query('RESET ROLE').catch(() => {});
  }
};
