import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createPartnerEmailUpdater, canCorrectPendingPartnerEmail, PartnerEmailPartialSaveError, type PartnerEmailRecord } from './partner-email-update';
import { invalidatePartnerEmailAccess, partnerEmailUpdateFeedback } from './partner-email-feedback';
const id = '11111111-1111-4111-8111-111111111111';
const pending: PartnerEmailRecord = { id, tipo: 'Aluno', nome: 'Aluno sintético', email: 'old@example.invalid', authLoginEmail: 'old@example.invalid',
  authUserId: '22222222-2222-4222-8222-222222222222', trocaSenhaObrigatoria: true, senhaAtualizadaEm: null, acessoStatus: 'pendente_senha' };
function fixture(overrides: Partial<PartnerEmailRecord> = {}, options: { failSave?: boolean; rejectCorrection?: boolean; deliveryPending?: boolean; loseCorrectionResponse?: boolean } = {}) {
  let current = { ...pending, ...overrides }, serial = 0;
  const calls: { kind: string; value?: unknown }[] = [];
  const update = createPartnerEmailUpdater({
    getCurrent: async () => { calls.push({ kind: 'get' }); return { ...current }; },
    getIdentity: async () => { calls.push({ kind: 'identity' }); return { email: String(current.authLoginEmail), has_auth_user: true, google_linked: false, google_email: null, linked_at: null }; },
    correct: async payload => {
      calls.push({ kind: 'correct', value: payload });
      if (options.rejectCorrection) throw Object.assign(new Error('Este e-mail já pertence a outra conta.'), { status: 409 });
      current = { ...current, email: payload.email, authLoginEmail: payload.email };
      if (options.loseCorrectionResponse && calls.filter(call => call.kind === 'correct').length === 1) throw new Error('Resposta perdida após concluir a correção.');
      return { success: true, emailCorrected: true, loginEmailChanged: true, emailSent: !options.deliveryPending, deliveryPending: Boolean(options.deliveryPending),
        userId: current.authUserId!, email: payload.email, message: options.deliveryPending ? 'E-mail corrigido, envio pendente.' : 'Link enviado ao e-mail corrigido.' };
    },
    save: async (_id, data, omitEmail) => {
      calls.push({ kind: 'save', value: { data, omitEmail } });
      if (options.failSave) throw new Error('Falha sintética no cadastro.');
      current = { ...current, ...data, authLoginEmail: current.authLoginEmail, ...(omitEmail ? { email: current.email } : {}) }; return current;
    },
    ensureStudent: async (_id, email) => { calls.push({ kind: 'student', value: email }); return { success: true, inviteSent: true, studentAccessPending: true, message: 'Primeiro acesso enviado.' }; },
    ensureProfessor: async value => { calls.push({ kind: 'professor' }); return value; },
    uuid: () => `request-${++serial}`,
  });
  return { update, calls, current: () => current, setCurrent: (next: Partial<PartnerEmailRecord>) => { current = { ...current, ...next }; } };
}

test('pending linked student corrects Auth before saving other fields, preserving the same UID and a bound expected identity', async () => {
  const f = fixture(); const updated = await f.update(id, { ...pending, nome: 'Dados corrigidos', email: ' NEW@EXAMPLE.INVALID ' });
  assert.deepEqual(f.calls.map(call => call.kind), ['get', 'identity', 'correct', 'save']);
  assert.deepEqual(f.calls.find(call => call.kind === 'correct')?.value, { partnerId: id, email: 'new@example.invalid', expectedEmail: pending.email,
    expectedAuthUserId: pending.authUserId, expectedAuthEmail: pending.authLoginEmail, requestId: 'request-1' });
  assert.equal((f.calls.at(-1)?.value as { omitEmail: boolean }).omitEmail, true);
  assert.equal(updated.authUserId, pending.authUserId); assert.equal(updated.email, 'new@example.invalid');
  assert.equal((updated.emailUpdateResult as { emailSent: boolean }).emailSent, true);
});

test('legacy contact already corrected still repairs the pending login when Auth retains the old address', async () => {
  const f = fixture({ email: 'new@example.invalid' });
  await f.update(id, { ...pending, email: 'new@example.invalid' });
  const correction = f.calls.find(call => call.kind === 'correct')?.value as { expectedEmail: string; expectedAuthEmail: string };
  assert.equal(correction.expectedEmail, 'new@example.invalid'); assert.equal(correction.expectedAuthEmail, 'old@example.invalid');
  assert.equal(f.calls.filter(call => call.kind === 'correct').length, 1);
});

test('active student contact editing preserves the existing login and never invokes an Auth correction or sends a recovery email', async () => {
  const f = fixture({ acessoStatus: 'ativo', senhaAtualizadaEm: '2026-11-01T12:00:00Z' });
  const updated = await f.update(id, { ...pending, email: 'contact@example.invalid' });
  assert.deepEqual(f.calls.map(call => call.kind), ['get', 'save']);
  assert.equal(updated.email, 'contact@example.invalid'); assert.equal(updated.authLoginEmail, pending.authLoginEmail);
  assert.match((updated.emailUpdateResult as { message: string }).message, /acesso e a senha.*preservados/);
});

test('only an explicitly pending institutional first access permits a linked professor email correction', async () => {
  assert.equal(canCorrectPendingPartnerEmail({ ...pending, tipo: 'Professor' }), false);
  const active = fixture({ tipo: 'Professor', primeiroAcessoInstitucionalPendente: false });
  await assert.rejects(active.update(id, { ...pending, tipo: 'Professor', email: 'new@example.invalid' }), /já existente.*preservado/);
  assert.deepEqual(active.calls.map(call => call.kind), ['get']);
  const f = fixture({ tipo: 'Professor', primeiroAcessoInstitucionalPendente: true }, { deliveryPending: true });
  const updated = await f.update(id, { ...pending, tipo: 'Professor', email: 'new@example.invalid' });
  assert.equal(f.calls.filter(call => call.kind === 'correct').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'professor').length, 0, 'The correction endpoint already requested the first-access delivery');
  const feedback = partnerEmailUpdateFeedback(updated.emailUpdateResult as never);
  assert.equal(feedback?.type, 'warning'); assert.equal(feedback?.title, 'E-mail corrigido, envio pendente');
  assert.doesNotMatch(feedback?.message || '', /enviado/);
});

test('without Auth, changed student email saves normally and prepares access once; unchanged email never resends', async () => {
  const f = fixture({ authUserId: null, authLoginEmail: null });
  const updated = await f.update(id, { ...pending, authUserId: null, email: 'new@example.invalid' });
  assert.deepEqual(f.calls.map(call => call.kind), ['get', 'save', 'student']);
  assert.equal((updated.emailUpdateResult as { deliveryPending: boolean }).deliveryPending, false, 'First access still pending does not mean the delivered email is pending');
  await f.update(id, { ...pending, authUserId: null, email: 'new@example.invalid' });
  assert.equal(f.calls.filter(call => call.kind === 'student').length, 1);
});

test('a failed correction leaves all other data untouched; a later profile failure reports the already completed email change honestly', async () => {
  const rejected = fixture({}, { rejectCorrection: true });
  await assert.rejects(rejected.update(id, { ...pending, email: 'duplicate@example.invalid' }), /outra conta/);
  assert.equal(rejected.calls.filter(call => call.kind === 'save').length, 0);
  const partial = fixture({}, { failSave: true, deliveryPending: true });
  await assert.rejects(partial.update(id, { ...pending, nome: 'Novo nome', email: 'new@example.invalid' }), error => {
    assert(error instanceof PartnerEmailPartialSaveError); assert.equal(error.partnerId, id);
    assert.match(error.message, /e-mail já foi corrigido/); assert.match(error.message, /envio do link ficou pendente/);
    assert.match(error.message, /demais dados não foram salvos/); assert.equal(error.emailUpdateResult.emailSent, false); return true;
  });
  assert.equal(partial.current().email, 'new@example.invalid'); assert.equal(partial.current().nome, pending.nome);
});

test('double-clicked saves share one correction and another draft cannot race it', async () => {
  const f = fixture(), draft = { ...pending, email: 'new@example.invalid' };
  const first = f.update(id, draft), second = f.update(id, draft);
  assert.equal(first, second);
  await assert.rejects(f.update(id, { ...draft, nome: 'Outra alteração' }), /gravação em andamento/);
  await first; assert.equal(f.calls.filter(call => call.kind === 'correct').length, 1);
  await assert.rejects(f.update(id, { ...draft, id: 'other-person' }), /rascunho não corresponde/);
});

test('email access invalidation refreshes only this partner status keys along with the partner lists', async () => {
  const client = new QueryClient();
  const keys = [['parceiro', id], ['parceiros', 'cadastros'], ['partner-email-confirmation-status', id], ['partner-google-identity-status', id, 'old@example.invalid']];
  keys.forEach(key => client.setQueryData(key, { cached: true }));
  const other = ['partner-email-confirmation-status', 'other']; client.setQueryData(other, { cached: true });
  await invalidatePartnerEmailAccess(client, id);
  keys.forEach(key => assert.equal(client.getQueryState(key)?.isInvalidated, true));
  assert.equal(client.getQueryState(other)?.isInvalidated, false); client.clear();
});


test('an ambiguous correction response replays the exact same request after canonical email and Auth already changed', async () => {
  const f = fixture({}, { loseCorrectionResponse: true }), draft = { ...pending, email: 'new@example.invalid' };
  await assert.rejects(f.update(id, draft), /Resposta perdida/);
  assert.equal(f.current().email, 'new@example.invalid'); assert.equal(f.current().authLoginEmail, 'new@example.invalid');
  await assert.rejects(f.update(id, { ...draft, email: 'another@example.invalid' }), /correção anterior ainda não foi conferida/);
  const updated = await f.update(id, { ...draft, nome: 'Outro dado corrigido no mesmo envio' });
  const requests = f.calls.filter(call => call.kind === 'correct').map(call => call.value);
  assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  assert.equal(f.calls.filter(call => call.kind === 'identity').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'save').length, 1);
  assert.equal(updated.emailUpdateResult?.emailSent, true);
});

test('a proven correction conflict permits editing the address and does not retain an unknown-outcome request', async () => {
  const options = { rejectCorrection: true }, f = fixture({}, options);
  await assert.rejects(f.update(id, { ...pending, email: 'duplicate@example.invalid' }), /outra conta/);
  options.rejectCorrection = false;
  const updated = await f.update(id, { ...pending, email: 'valid@example.invalid' });
  assert.equal(updated.email, 'valid@example.invalid');
  const requests = f.calls.filter(call => call.kind === 'correct').map(call => call.value as { requestId: string });
  assert.notEqual(requests[0].requestId, requests[1].requestId);
});

test('a confirmed email correction with delivery pending replays its immutable request on the next save', async () => {
  const options = { deliveryPending: true }, f = fixture({ tipo: 'Professor', primeiroAcessoInstitucionalPendente: true }, options);
  const draft = { ...pending, tipo: 'Professor', email: 'new@example.invalid' };
  const first = await f.update(id, draft);
  assert.equal(first.emailUpdateResult?.deliveryPending, true);
  assert.equal(f.current().email, draft.email); assert.equal(f.current().authLoginEmail, draft.email);
  await assert.rejects(f.update(id, { ...draft, email: 'another@example.invalid' }), /correção anterior ainda não foi conferida/);
  options.deliveryPending = false;
  const second = await f.update(id, { ...draft, nome: 'Mesmo primeiro acesso' });
  const requests = f.calls.filter(call => call.kind === 'correct').map(call => call.value);
  assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  assert.equal(second.emailUpdateResult?.emailSent, true); assert.equal(second.emailUpdateResult?.deliveryPending, false);
  assert.equal(f.calls.filter(call => call.kind === 'identity').length, 1);
  await f.update(id, draft);
  assert.equal(f.calls.filter(call => call.kind === 'correct').length, 2, 'Delivered requests do not send again');
});

test('canonical proof of completed first access releases a pending delivery without sending or blocking contact editing', async () => {
  const f = fixture({}, { deliveryPending: true }), draft = { ...pending, email: 'new@example.invalid' };
  await f.update(id, draft);
  f.setCurrent({ senhaAtualizadaEm: '2026-11-12T22:00:00Z', acessoStatus: 'ativo' });
  const updated = await f.update(id, { ...draft, email: 'contact@example.invalid' });
  assert.equal(updated.email, 'contact@example.invalid'); assert.equal(updated.authLoginEmail, draft.email);
  assert.equal(f.calls.filter(call => call.kind === 'correct').length, 1);
});
