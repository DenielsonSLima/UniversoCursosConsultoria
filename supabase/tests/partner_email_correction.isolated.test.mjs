import assert from 'node:assert/strict';
import test from 'node:test';
import { createPartnerEmailCorrectionDatabase, ids, correct, delivery, correctionRequest } from './fixtures/partner-email-correction-harness.mjs';
const isolated = async action => {
  const db = await createPartnerEmailCorrectionDatabase();
  try { await action(db); } finally { await db.close(); }
};
const one = async (db, sql) => (await db.query(sql)).rows[0];
test('corrects only the same unused UID and civil profile, clears old links, stays unconfirmed and replays without mutation', () => isolated(async db => {
  const before = await one(db, `SELECT auth_user_id,cpf_cnpj,aceitou_termos_uso FROM public.parceiros WHERE id='${ids.student}'`);
  const first = (await correct(db)).rows[0].result;
  assert.equal(first.userId, ids.auth); assert.equal(first.email, 'corrigido@example.com'); assert.equal(first.emailSent, false);
  assert.deepEqual(await one(db, `SELECT auth_user_id,cpf_cnpj,aceitou_termos_uso FROM public.parceiros WHERE id='${ids.student}'`), before);
  assert.deepEqual(await one(db, `SELECT email,auth_login_email,acesso_status,troca_senha_obrigatoria,email_validado_gestor_em
    FROM public.parceiros WHERE id='${ids.student}'`), { email: 'corrigido@example.com', auth_login_email: 'corrigido@example.com',
    acesso_status: 'pendente', troca_senha_obrigatoria: true, email_validado_gestor_em: null });
  assert.deepEqual(await one(db, `SELECT email,email_confirmed_at,encrypted_password,confirmation_token,recovery_token,
    raw_user_meta_data->>'email_verified' AS verified FROM auth.users WHERE id='${ids.auth}'`), {
    email: 'corrigido@example.com', email_confirmed_at: null, encrypted_password: '', confirmation_token: '', recovery_token: '', verified: 'false',
  });
  assert.deepEqual(await one(db, `SELECT email,identity_data->>'email_verified' AS verified FROM auth.identities WHERE user_id='${ids.auth}'`), {
    email: 'corrigido@example.com', verified: 'false',
  });
  assert.equal((await one(db, 'SELECT count(*)::int n FROM auth.one_time_tokens')).n, 0);
  await db.exec(`UPDATE auth.users SET recovery_token='new-email-token' WHERE id='${ids.auth}'`);
  await correct(db);
  assert.equal((await one(db, `SELECT recovery_token FROM auth.users WHERE id='${ids.auth}'`)).recovery_token, 'new-email-token', 'Core replay never rotates a newly issued token.');
  await assert.rejects(correct(db, { email: 'outra@example.com' }), error => error.code === '40001');
}));

test('legacy corrected contact and confirmed synthetic login retain the same identity', () => isolated(async db => {
  await db.exec(`UPDATE public.parceiros SET email='corrigido@example.com',auth_login_email='legado@acesso.universocc.invalid' WHERE id='${ids.student}';
    UPDATE auth.users SET email='legado@acesso.universocc.invalid',email_confirmed_at=now() WHERE id='${ids.auth}';
    UPDATE auth.identities SET identity_data=jsonb_set(identity_data,'{email}','"legado@acesso.universocc.invalid"') WHERE user_id='${ids.auth}';`);
  await correct(db, { expectedEmail: 'corrigido@example.com', expectedAuthEmail: 'legado@acesso.universocc.invalid' });
  assert.equal((await one(db, `SELECT email_confirmed_at FROM auth.users WHERE id='${ids.auth}'`)).email_confirmed_at, null);
  assert.equal((await one(db, `SELECT auth_user_id FROM public.parceiros WHERE id='${ids.student}'`)).auth_user_id, ids.auth);
}));

test('manual confirmation without a password is still pending; real corrected email is never preconfirmed', () => isolated(async db => {
  await db.exec(`UPDATE auth.users SET email_confirmed_at=now() WHERE id='${ids.auth}';
    UPDATE auth.identities SET identity_data=jsonb_set(identity_data,'{email_verified}','true') WHERE user_id='${ids.auth}';
    UPDATE public.parceiros SET tipo='Professor',email_validado_gestor_em=now() WHERE id='${ids.student}'`);
  await correct(db);
  assert.deepEqual(await one(db, `SELECT acesso_status,primeiro_acesso_institucional_pendente,
    senha_institucional_criada_em,email_validado_gestor_em FROM public.parceiros WHERE id='${ids.student}'`), {
    acesso_status: 'pendente', primeiro_acesso_institucional_pendente: true,
    senha_institucional_criada_em: null, email_validado_gestor_em: null,
  });
  assert.equal((await one(db, `SELECT email_confirmed_at FROM auth.users WHERE id='${ids.auth}'`)).email_confirmed_at, null);
  assert.equal((await one(db, `SELECT identity_data->>'email_verified' AS verified FROM auth.identities WHERE user_id='${ids.auth}'`)).verified, 'false');
}));

test('claim revalidates provider email uniqueness after the atomic correction', () => isolated(async db => {
  await correct(db);
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${ids.other}','different@example.com');
    INSERT INTO auth.identities(user_id,provider_id,provider,identity_data)
    VALUES('${ids.other}','external','google','{"email":"CORRIGIDO@example.com"}')`);
  await assert.rejects(delivery(db, 'CLAIM'), error => error.code === '40001');
  assert.equal((await one(db, 'SELECT state FROM private.portal_partner_email_corrections')).state, 'COMMITTED');
}));

test('delivery is leased, replay after success never rotates links, and another profile cannot take the in-flight identity', () => isolated(async db => {
  await correct(db);
  const claim = (await delivery(db, 'CLAIM')).rows[0].result;
  assert.equal(claim.claimed, true); assert.equal(claim.email, 'corrigido@example.com');
  const duplicate = (await delivery(db, 'CLAIM')).rows[0].result;
  assert.equal(duplicate.claimed, false); assert(duplicate.retryAfterSeconds > 0);
  await assert.rejects(db.exec(`INSERT INTO public.parceiros(id,tipo,email,auth_user_id,auth_login_email,cpf_cnpj)
    VALUES('${ids.other}','Professor','corrigido@example.com','${ids.auth}','corrigido@example.com','52998224725')`), error => error.code === '40001');
  await assert.rejects(correct(db, { request: ids.issuance, email: 'terceiro@example.com', expectedEmail: 'corrigido@example.com', expectedAuthEmail: 'corrigido@example.com' }), error => error.code === '40001');
  await delivery(db, 'FINISH', { nonce: claim.deliveryNonce, sent: true, definitiveFailure: false });
  await db.exec(`UPDATE auth.users SET recovery_token='after-success' WHERE id='${ids.auth}'`);
  assert.equal((await correct(db)).rows[0].result.emailSent, true);
  assert.equal((await delivery(db, 'CLAIM')).rows[0].result.emailSent, true);
  assert.equal((await one(db, `SELECT recovery_token FROM auth.users WHERE id='${ids.auth}'`)).recovery_token, 'after-success');
}));

test('an unknown SMTP result is recoverable after a bounded cooldown without creating a new identity', () => isolated(async db => {
  await correct(db); const claim = (await delivery(db, 'CLAIM')).rows[0].result;
  await delivery(db, 'FINISH', { nonce: claim.deliveryNonce, sent: false, definitiveFailure: false });
  assert.equal((await delivery(db, 'CLAIM')).rows[0].result.claimed, false);
  await db.exec(`UPDATE private.portal_partner_email_corrections SET delivery_lease_until=now()-interval '1 second',retry_at=now()-interval '1 second'
    WHERE request_id='${correctionRequest}'; UPDATE auth.users SET recovery_token='old-ambiguous-token' WHERE id='${ids.auth}'`);
  const again = (await delivery(db, 'CLAIM')).rows[0].result;
  assert.equal(again.claimed, true); assert.notEqual(again.deliveryNonce, claim.deliveryNonce); assert.equal(again.userId, ids.auth);
  assert.equal((await one(db, `SELECT recovery_token FROM auth.users WHERE id='${ids.auth}'`)).recovery_token, '');
  await assert.rejects(delivery(db, 'FINISH', { nonce: claim.deliveryNonce, sent: true, definitiveFailure: false }), error => error.code === '40001');
}));

test('passwords, sessions, external providers, shared roles, duplicate email and forged authority are rejected before mutation', async () => {
  for (const mutation of [
    `UPDATE auth.users SET encrypted_password='own-password'`,
    `UPDATE auth.users SET last_sign_in_at=now()`,
    `INSERT INTO auth.sessions VALUES('${ids.other}','${ids.auth}')`,
    `UPDATE auth.identities SET provider='google'`,
    `INSERT INTO public.responsaveis_legais(id,auth_user_id,email,cpf_normalizado) VALUES('${ids.other}','${ids.auth}','aluno@example.com','52998224725')`,
    `UPDATE auth.users SET encrypted_password='own-ready-password',email_confirmed_at=now() WHERE id='${ids.auth}'`,
  ]) await isolated(async db => {
    await db.exec(mutation);
    await assert.rejects(correct(db), error => ['55000','23514'].includes(error.code));
    assert.equal((await one(db, `SELECT email FROM auth.users WHERE id='${ids.auth}'`)).email, 'aluno@example.com');
  });
  await isolated(async db => {
    await db.exec(`INSERT INTO auth.users(id,email) VALUES('${ids.other}','corrigido@example.com')`);
    await assert.rejects(correct(db), error => error.code === '23505');
  });
  await isolated(async db => {
    await assert.rejects(correct(db, { expectedEmail: 'stale@example.com' }), error => error.code === '40001');
    await assert.rejects(correct(db, { actor: ids.other }), error => error.code === '42501');
    await db.exec(`SELECT set_config('request.jwt.claim.role','authenticated',false)`);
    await assert.rejects(correct(db), error => error.code === '42501');
  });
});

test('private ledger stays inaccessible, RPC grants are service-only and scoped gestores cannot correct another polo', () => isolated(async db => {
  for (const role of ['anon','authenticated']) {
    assert.equal((await db.query(`SELECT has_function_privilege($1,
      'public.portal_correct_partner_email_internal(uuid,uuid,uuid,text,text,uuid,text)','EXECUTE') AS allowed`, [role])).rows[0].allowed, false);
    assert.equal((await db.query(`SELECT has_table_privilege($1,'private.portal_partner_email_corrections','SELECT') AS allowed`, [role])).rows[0].allowed, false);
  }
  assert.equal((await one(db, `SELECT has_function_privilege('service_role',
    'public.portal_correct_partner_email_internal(uuid,uuid,uuid,text,text,uuid,text)','EXECUTE') AS allowed`)).allowed, true);
  assert((await one(db, `SELECT indexdef FROM pg_indexes WHERE indexname='portal_partner_email_correction_auth_idx'`)).indexdef.includes('delivery_lease_until'));
  await db.exec(`UPDATE public.usuarios_sistema SET context='${ids.other}',polo_ids=ARRAY['${ids.other}'::uuid],
    permissoes='{"allPolos":false,"modules":["parceiros"]}' WHERE auth_user_id='${ids.actor}'`);
  await assert.rejects(correct(db), error => error.code === '42501');
}));
