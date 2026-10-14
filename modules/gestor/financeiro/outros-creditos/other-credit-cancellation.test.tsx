import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContasReceber } from '../financeiro.types';
import type { OtherCreditCancellationModel } from './useOtherCreditCancellation';
import { OtherCreditRow } from './OtherCreditRow';
import { OtherCreditCancellationContent } from './OtherCreditCancellationModal';
import {
  otherCreditCancellationBlockReason, otherCreditCancellationSnapshot,
  selectableOtherCredits, toggleOtherCreditSelection,
} from './other-credit-cancellation.selection';
import {
  loadOtherCreditCancellationAttempts, saveOtherCreditCancellationAttempts,
} from './other-credit-cancellation.attempt';

const credit = (id: string, changes: Partial<ContasReceber> = {}): ContasReceber => ({
  id, poloId: 'polo', descricao: `Aulas avulsas ${id}`, categoria: 'OUTROS_CREDITOS',
  clienteNome: 'Parceiro de teste', dataVencimento: '2026-10-31', valor: 269.9,
  status: 'PENDENTE', otherCreditCancellationEligible: true,
  gatewayProvider: 'banese_card', formaPagamento: 'BOLETO', asaasPaymentId: `boleto-${id}`,
  ...changes,
});

test('seleção exige autorização canônica e recusa pagamento, importação e vínculo acadêmico', () => {
  const valid = credit('valid');
  const invalid = [
    credit('missing', { otherCreditCancellationEligible: undefined }),
    credit('denied', { otherCreditCancellationEligible: false }),
    credit('paid', { status: 'PAGO' }), credit('partial', { valorPago: 1 }),
    credit('settlement', { manualSettlementId: 'settlement' }),
    credit('imported', { origemPagamento: 'SISTEMA_ANTERIOR' }),
    credit('academic', { matriculaId: 'matricula' }),
    credit('cnab', { gatewaySettlementSource: 'CNAB240' }),
    credit('ambiguous', { asaasStatus: 'API_AMBIGUOUS' }),
    credit('other-bank', { gatewayProvider: 'asaas' }),
  ];
  assert.equal(otherCreditCancellationBlockReason(valid), null);
  assert.deepEqual(selectableOtherCredits([valid, ...invalid]).map(item => item.id), ['valid']);
});

test('local sem referências só pode ser selecionado com capability explícita', () => {
  const local = credit('local', { gatewayProvider: undefined, asaasPaymentId: undefined });
  assert.equal(otherCreditCancellationBlockReason(local), null);
  assert.ok(otherCreditCancellationBlockReason({ ...local, otherCreditCancellationEligible: undefined }));
  assert.ok(otherCreditCancellationBlockReason({ ...local, boletoNossoNumero: 'bank-reference' }));
});

test('seleção do grupo inclui somente elegíveis, preserva outros grupos e permite limpar limite parcial', () => {
  const page = Array.from({ length: 30 }, (_, index) => credit(String(index)));
  const first = toggleOtherCreditSelection(new Set(['outside']), page);
  assert.equal(first.size, 25);
  assert.ok(first.has('outside'));
  assert.equal(first.has('24'), false);
  assert.deepEqual([...toggleOtherCreditSelection(first, page)], ['outside']);
  const group = [credit('a'), credit('b', { status: 'PAGO' })];
  assert.deepEqual([...toggleOtherCreditSelection(new Set(), group)], ['a']);
  assert.equal(toggleOtherCreditSelection(new Set(['a']), group).size, 0);
});

test('snapshot detecta pagamento, alteração de valor e referência bancária antes da confirmação', () => {
  const original = credit('one');
  for (const changes of [{ valor: 300 }, { status: 'PAGO' as const }, { asaasPaymentId: 'new' }, { dataPagamento: '2026-10-14' }]) {
    assert.notEqual(otherCreditCancellationSnapshot(original), otherCreditCancellationSnapshot({ ...original, ...changes }));
  }
});

test('linha permite seleção e cancelamento e não oferece atualização manual', () => {
  const row = renderToStaticMarkup(<table><tbody><OtherCreditRow item={credit('one')} index={0}
    model={{ syncMutation: { isPending: false, mutate() {} }, copyLink() {}, openReceiveModal() {}, openPaymentModal() {} } as any}
    cancellation={{ selectedIds: new Set(['one']), pending: false, selectionLocked: false, reservedIds: new Set(), toggle() {}, open() {} }} /></tbody></table>);
  assert.match(row, /Selecionar Aulas avulsas one/);
  assert.match(row, /Cancelar/);
  assert.match(row, /checked=""/);
  assert.doesNotMatch(row, /Atualizar/);
});

test('resultado parcial distingue cancelado de revisão e mantém ação da mesma operação', () => {
  const model = {
    reviewItems: [credit('one'), credit('two')], reason: 'Emissão com valores incorretos',
    pending: false, attempted: true, changed: false, error: null,
    results: [{ receivableId: 'one', status: 'CANCELED' }, { receivableId: 'two', status: 'REVIEW_REQUIRED', message: 'Consulta pendente.' }],
    setReason() {}, close() {}, confirm() {},
  } as unknown as OtherCreditCancellationModel;
  const html = renderToStaticMarkup(<OtherCreditCancellationContent model={model} />);
  assert.match(html, /Cancelado/);
  assert.match(html, /Aguardando conferência/);
  assert.match(html, /Consulta pendente/);
  assert.match(html, /Conferir cancelamento/);
  assert.doesNotMatch(html, /Todos os créditos selecionados foram cancelados/);
  assert.match(html, /textarea[^>]*disabled/);
});

test('retomada persiste somente operação mínima e é isolada por usuário e polo', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const attempt = { idempotencyKey: '00000000-0000-4000-8000-000000000001', receivableIds: ['00000000-0000-4000-8000-000000000002'], reason: 'Boletos com valor errado', createdAt: Date.now() };
  assert.equal(saveOtherCreditCancellationAttempts('actor-one', 'polo-one', [attempt], storage), true);
  assert.deepEqual(loadOtherCreditCancellationAttempts('actor-one', 'polo-one', storage), [attempt]);
  assert.deepEqual(loadOtherCreditCancellationAttempts('actor-two', 'polo-one', storage), []);
  assert.deepEqual(loadOtherCreditCancellationAttempts('actor-one', 'polo-two', storage), []);
  assert.deepEqual(Object.keys(JSON.parse([...data.values()][0])[0]), ['idempotencyKey', 'receivableIds', 'reason', 'createdAt']);
  const second = { ...attempt, idempotencyKey: '00000000-0000-4000-8000-000000000003', receivableIds: ['00000000-0000-4000-8000-000000000004'] };
  saveOtherCreditCancellationAttempts('actor-one', 'polo-one', [attempt, second], storage);
  assert.equal(loadOtherCreditCancellationAttempts('actor-one', 'polo-one', storage).length, 2);
  saveOtherCreditCancellationAttempts('actor-one', 'polo-one', [], storage);
  assert.deepEqual(loadOtherCreditCancellationAttempts('actor-one', 'polo-one', storage), []);
  for (const invalid of [{ ...attempt, receivableIds: Array(26).fill(attempt.receivableIds[0]) }, { ...attempt, idempotencyKey: 'bad' }, { ...attempt, reason: 'short' }]) {
    saveOtherCreditCancellationAttempts('actor-one', 'polo-one', [invalid], storage);
    assert.deepEqual(loadOtherCreditCancellationAttempts('actor-one', 'polo-one', storage), []);
  }
});
