import { readFile } from 'node:fs/promises';
import { createStudentEmailDatabase, seedStudentEmailDatabase, ids } from './student-email-confirmation-harness.mjs';
export { ids };
export const correctionMigrations = [
  '20261112220600_partner_email_correction_ledger.sql',
  '20261112220700_partner_email_correction_atomic.sql',
  '20261112220800_partner_email_correction_delivery.sql',
];
export const correctionRequest = '77777777-7777-4777-8777-777777777777';
export async function createPartnerEmailCorrectionDatabase() {
  const db = await createStudentEmailDatabase();
  try {
    await installPartnerEmailCorrectionFixture(db);
    return db;
  } catch (error) { await db.close(); throw error; }
}
export async function installPartnerEmailCorrectionFixture(db) {
    await seedStudentEmailDatabase(db);
    await db.exec(`ALTER TABLE auth.users
      ADD COLUMN last_sign_in_at timestamptz, ADD COLUMN deleted_at timestamptz,
      ADD COLUMN banned_until timestamptz, ADD COLUMN is_sso_user boolean DEFAULT false,
      ADD COLUMN is_anonymous boolean DEFAULT false, ADD COLUMN confirmation_sent_at timestamptz,
      ADD COLUMN recovery_sent_at timestamptz, ADD COLUMN email_change_token_new text DEFAULT '',
      ADD COLUMN email_change_token_current text DEFAULT '', ADD COLUMN email_change text DEFAULT '',
      ADD COLUMN email_change_sent_at timestamptz, ADD COLUMN email_change_confirm_status smallint DEFAULT 0,
      ADD COLUMN phone_change text DEFAULT '', ADD COLUMN phone_change_token text DEFAULT '',
      ADD COLUMN phone_change_sent_at timestamptz, ADD COLUMN reauthentication_token text DEFAULT '',
      ADD COLUMN reauthentication_sent_at timestamptz;
      CREATE UNIQUE INDEX synthetic_auth_email_unique ON auth.users(lower(email));
      CREATE TABLE auth.refresh_tokens(id bigint GENERATED ALWAYS AS IDENTITY, user_id text);
      CREATE TABLE auth.identities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),
        provider_id text,provider text,identity_data jsonb,updated_at timestamptz DEFAULT now(),
        email text GENERATED ALWAYS AS (identity_data->>'email') STORED);
      ALTER TABLE public.parceiros ADD COLUMN convite_enviado_em timestamptz;
      DELETE FROM auth.sessions;
      UPDATE auth.users SET encrypted_password='',raw_user_meta_data='{"email_verified":false,"custom":"preservar"}' WHERE id='${ids.auth}';
      DELETE FROM public.portal_identidade_institucional_senha_eventos WHERE auth_user_id='${ids.auth}';
      UPDATE public.parceiros SET acesso_status='pendente',troca_senha_obrigatoria=true,
        senha_atualizada_em=NULL,email_validado_gestor_em=NULL WHERE id='${ids.student}';
      INSERT INTO auth.identities(user_id,provider_id,provider,identity_data)
      VALUES('${ids.auth}','${ids.auth}','email','{"sub":"${ids.auth}","email":"aluno@example.com","email_verified":false}');`);
    for (const name of correctionMigrations) {
      await db.exec(await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
    }
}
export const correct = (db, overrides = {}) => db.query(`SELECT public.portal_correct_partner_email_internal(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::uuid,$7::text) AS result`, [
  overrides.actor ?? ids.actor, overrides.partner ?? ids.student, overrides.request ?? correctionRequest,
  overrides.email ?? 'corrigido@example.com', overrides.expectedEmail ?? 'aluno@example.com',
  overrides.auth ?? ids.auth, overrides.expectedAuthEmail ?? 'aluno@example.com',
]);
export const delivery = (db, action, overrides = {}) => db.query(`SELECT public.portal_partner_email_correction_delivery_internal(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::boolean,$7::boolean) AS result`, [
  overrides.actor ?? ids.actor, overrides.partner ?? ids.student, overrides.request ?? correctionRequest,
  action, overrides.nonce ?? null, overrides.sent ?? null, overrides.definitiveFailure ?? null,
]);
