import assert from 'node:assert/strict';
import test from 'node:test';
import { createInviteFixture, ids } from './fixtures/student-invite-state-harness.mjs';

const isolated = async (options, run) => {
  const fixture = await createInviteFixture(options);
  try { await run(fixture); } finally { await fixture.close(); }
};
const passwordPreserved = async fixture => {
  const current = await fixture.row();
  assert.equal(current.acesso_status, 'ativo');
  assert.equal(current.troca_senha_obrigatoria, false);
  assert.ok(current.senha_atualizada_em);
  assert.equal(current.aceitou_termos_uso, false);
  assert.equal(current.termos_uso_versao, null);
  const user = (await fixture.db.query('SELECT encrypted_password FROM auth.users WHERE id=$1', [ids.auth])).rows[0];
  assert.equal(user.encrypted_password, 'opaque-own-hash-created-during-request');
};
const conflict = async response => {
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.code, 'ALUNO_ACESSO_ALTERADO_DURANTE_ENVIO');
  assert.equal(body.recoveryLink, null);
  return body;
};

test('reenvio não rebaixa senha criada durante a consulta Auth', () => isolated({}, async f => {
  f.hooks.getAuth = f.completePassword;
  const body = await conflict(await f.run());
  await passwordPreserved(f);
  assert.equal(f.counts.recovery, 0);
  assert.equal(f.counts.applied, 1);
  assert.equal(body.recoveryEmailSent, false);
}));

test('conflito depois de gerar link não entrega link nem rebaixa senha', () => isolated({}, async f => {
  f.hooks.generateLink = f.completePassword;
  const body = await conflict(await f.run());
  await passwordPreserved(f);
  assert.equal(f.counts.recovery, 1);
  assert.equal(body.inviteSent, false);
  assert.equal(body.recoveryEmailSent, false);
}));

test('conflito depois do envio informa entrega real e preserva senha e termos', () => isolated({ email: true }, async f => {
  f.hooks.email = f.completePassword;
  const body = await conflict(await f.run());
  await passwordPreserved(f);
  assert.equal(f.counts.emails, 1);
  assert.equal(f.counts.recovery, 0);
  assert.equal(body.recoveryEmailSent, true);
  assert.match(body.error, /já foi enviado/);
}));

test('failure responder também compara prova antes de marcar erro', () => isolated({}, async f => {
  f.hooks.getAuth = async () => {
    await f.completePassword();
    throw new Error('Falha sintética de transporte');
  };
  await conflict(await f.run());
  await passwordPreserved(f);
  assert.equal(f.counts.applied, 1);
}));

test('mudança de e-mail cadastral bloqueia escrita com identidade antiga', () => isolated({}, async f => {
  f.hooks.getAuth = () => f.db.query('UPDATE public.parceiros SET email=$1 WHERE id=$2',
    ['novo@example.com', ids.student]);
  await conflict(await f.run());
  const current = await f.row();
  assert.equal(current.email, 'novo@example.com');
  assert.equal(current.auth_login_email, 'aluno@example.com');
  assert.equal(f.counts.recovery, 0);
  assert.equal(f.counts.applied, 1);
}));

test('mudança dos polos secundários invalida o escopo do snapshot', () => isolated({}, async f => {
  f.hooks.getAuth = () => f.db.query('UPDATE public.parceiros SET polo_ids=$1::uuid[] WHERE id=$2',
    [`{${ids.other}}`, ids.student]);
  await conflict(await f.run());
  assert.deepEqual((await f.row()).polo_ids, [ids.other]);
  assert.equal(f.counts.recovery, 0);
  assert.equal(f.counts.applied, 1);
}));

test('novo vínculo também protege senha criada depois que o convite foi enviado', () => isolated({ unlinked: true }, async f => {
  f.hooks.invite = f.completePassword;
  const body = await conflict(await f.run());
  await passwordPreserved(f);
  assert.equal((await f.row()).auth_user_id, ids.auth);
  assert.equal(body.inviteSent, true);
  assert.equal(body.recoveryEmailSent, false);
  assert.equal(f.counts.invites, 1);
}));

test('vínculo multipapel compara a prova novamente no UPDATE', () => isolated({ shared: true }, async f => {
  f.hooks.sharedProof = f.completePassword;
  await conflict(await f.run());
  await passwordPreserved(f);
  assert.equal(f.counts.recovery, 0);
  assert.equal(f.counts.applied, 1);
}));

test('snapshot evolui após cada escrita própria sem conflito falso', () => isolated({}, async f => {
  const response = await f.run();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).recoveryLink, 'https://example.test/recovery');
  assert.equal(f.counts.applied, 3);
  const current = await f.row();
  assert.equal(current.acesso_status, 'pendente');
  assert.equal(current.troca_senha_obrigatoria, true);
  assert.equal(current.senha_atualizada_em, null);
  assert.equal(current.aceitou_termos_uso, false);
}));

test('CAS serializa polos UUID não nulos sem conflito falso', () => isolated({ poloIds: [ids.polo] }, async f => {
  assert.equal((await f.run()).status, 200);
  assert.equal(f.counts.applied, 3);
  assert.deepEqual((await f.row()).polo_ids, [ids.polo]);
}));

test('erro de persistência após envio não informa cancelamento do e-mail', () => isolated({ email: true }, async f => {
  f.hooks.beforeWrite = number => number === 3
    ? { code: 'XX000', message: 'Falha sintética de persistência' } : null;
  const response = await f.run();
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.recoveryEmailSent, true);
  assert.equal(body.inviteSent, false);
  assert.equal(body.recoveryLink, null);
  assert.equal(f.counts.emails, 1);
}));
