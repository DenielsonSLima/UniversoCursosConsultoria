import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContasReceber } from '../financeiro.types';
import { canReverseOtherCredit, validReversalReason } from './other-credit-reversal.model.ts';

const paid = {
  id: 'local-credit', poloId: 'polo', categoria: 'OUTROS_CREDITOS', status: 'PAGO',
  origemPagamento: 'PRESENCIAL', contaBancariaId: 'account', valorPago: 129.90,
  dataPagamento: '2026-11-05', descricao: 'Correção sintética', valor: 129.90, dataVencimento: '2026-11-05',
} as ContasReceber;

test('estorno local fica disponível sem apagar o lançamento original', () => {
  assert.equal(canReverseOtherCredit(paid), true);
  assert.equal(canReverseOtherCredit({ ...paid, tipoLancamento: 'OUTRO_CREDITO' }), true);
  for (const patch of [
    { status: 'PENDENTE' }, { status: 'ESTORNADO' }, { origemPagamento: 'BANESE' },
    { gatewayProvider: 'banese_card' }, { asaasPaymentId: 'bank' }, { boletoNossoNumero: 'bank' },
    { tipoLancamento: 'MATRICULA' }, { origemCronogramaId: 'schedule' }, { matriculaId: 'enrollment' }, { turmaId: 'class' }, { outrosCreditosPlanoId: 'plan' },
    { contaBancariaId: undefined }, { valorPago: 0 }, { dataPagamento: undefined },
  ]) assert.equal(canReverseOtherCredit({ ...paid, ...patch } as ContasReceber), false, JSON.stringify(patch));
});

test('motivo exige conteúdo útil e cabe na trilha auditável', () => {
  assert.equal(validReversalReason('     '), false);
  assert.equal(validReversalReason('erro'), false);
  assert.equal(validReversalReason('Lançamento duplicado'), true);
  assert.equal(validReversalReason('x'.repeat(501)), false);
});
