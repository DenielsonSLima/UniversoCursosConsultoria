import assert from 'node:assert/strict';
import { TransferFinancialAttempt, type TransferFinancialAttemptInput } from './transfer-financial-attempt.ts';
import type { TransferFinancialResult } from '../transfer-finance.contract.ts';
declare const Deno: { test(name: string, fn: () => void | Promise<void>): void };

const input = (requestId = 'first'): TransferFinancialAttemptInput => ({
  matriculaId: 'synthetic-enrollment', tipo: 'INTERNA_TURMA', turmaDestinoId: 'synthetic-target',
  dataTransferencia: '2026-09-24', motivo: 'Continuidade sintética', requestId, fingerprint: 'a'.repeat(64),
});
const result = (requestId = 'first'): TransferFinancialResult => ({
  transferenciaId: 'synthetic-transfer', matriculaOrigemId: 'synthetic-enrollment',
  matriculaDestinoId: 'synthetic-target', requestId, academicoConcluido: true, replayed: true,
  financeiro: { preservados: 1, locaisACancelar: 0, banesePendentes: 0, revisaoExterna: 0 },
});

Deno.test('duplo clique não duplica confirmação e o payload enviado é isolado', async () => {
  const attempt = new TransferFinancialAttempt();
  const draft = input();
  let finish!: (value: TransferFinancialResult) => void;
  let sent!: TransferFinancialAttemptInput;
  const pending = attempt.run(() => draft, (value) => {
    sent = value; return new Promise(resolve => { finish = resolve; });
  });
  draft.motivo = 'Alterado após o envio';
  assert.equal(await attempt.run(() => input('second'), async () => assert.fail()), null);
  assert.equal(sent.motivo, 'Continuidade sintética');
  finish(result());
  assert.deepEqual(await pending, result());
});

Deno.test('timeout seguido de rejeição SQL conserva a primeira chave e o payload', async () => {
  const attempt = new TransferFinancialAttempt();
  const sent: TransferFinancialAttemptInput[] = [];
  for (const failure of [new TypeError('Resposta perdida'), { code: '42501' }, { code: '40001' }, { code: 'PT409' }]) {
    await assert.rejects(attempt.run(() => input('replacement'), async value => {
      sent.push(value); throw failure;
    }));
    assert.equal(attempt.uncertain, true);
    assert.equal(attempt.hasInput, true);
  }
  const saved = await attempt.run(() => input('another'), async value => {
    sent.push(value); return result(value.requestId);
  });
  assert.ok(sent.every(value => JSON.stringify(value) === JSON.stringify(sent[0])));
  assert.equal(saved?.requestId, 'replacement');
  assert.equal(attempt.uncertain, false);
});

Deno.test('rejeição da primeira tentativa permite revisar e gerar nova chave', async () => {
  for (const code of ['40001', '40P01', 'PT409']) {
    const attempt = new TransferFinancialAttempt();
    await assert.rejects(attempt.run(() => input(), async () => { throw { code }; }));
    assert.equal(attempt.hasInput, false);
    assert.equal(attempt.uncertain, false);
    const saved = await attempt.run(() => input('revised'), async value => result(value.requestId));
    assert.equal(saved?.requestId, 'revised');
  }
});

Deno.test('falha posterior à confirmação não permite outra mutação', async () => {
  const attempt = new TransferFinancialAttempt();
  const saved = await attempt.run(() => input(), async () => result());
  assert.equal(attempt.confirmed, true);
  await assert.rejects(Promise.reject(new Error('Cache indisponível após confirmação')));
  assert.deepEqual(await attempt.run(() => input('second'), async () => assert.fail()), saved);
});
