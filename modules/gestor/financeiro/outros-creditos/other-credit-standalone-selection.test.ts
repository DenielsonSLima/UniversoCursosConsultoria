import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContasReceber } from '../financeiro.types';
import { otherCreditCancellationBlockReason, toggleOtherCreditSelection } from './other-credit-cancellation.selection.ts';

const credit = (patch: Partial<ContasReceber> = {}) => ({
  id: 'credit-1', poloId: 'polo-1', descricao: 'Crédito avulso', valor: 129.9,
  dataVencimento: '2026-11-10', categoria: 'OUTROS_CREDITOS', status: 'PENDENTE',
  origemPagamento: 'BANESE', gatewayProvider: 'banese_card', formaPagamento: 'BOLETO',
  gatewayPaymentMethod: 'BOLETO', asaasPaymentId: '000000001', asaasStatus: 'PENDING',
  otherCreditCancellationEligible: true, ...patch,
} as ContasReceber);

test('avulso sem carnê usa a capacidade canônica e participa da seleção individual e agrupada', () => {
  const standalone = credit();
  const installment = credit({ id: 'credit-2', outrosCreditosPlanoId: 'plan-1' });
  assert.equal(otherCreditCancellationBlockReason(standalone), null);
  const selected = toggleOtherCreditSelection(new Set(), [standalone, installment]);
  assert.deepEqual([...selected], ['credit-1', 'credit-2']);
  assert.equal(toggleOtherCreditSelection(selected, [standalone, installment]).size, 0);
});

test('a ausência de carnê nunca substitui autorização, pagamento ou integridade bancária', () => {
  const blocked = [
    credit({ otherCreditCancellationEligible: false } as Partial<ContasReceber>),
    credit({ status: 'PAGO', valorPago: 129.9 }),
    credit({ matriculaId: 'enrollment-1' }),
    credit({ turmaId: 'class-1' }),
    credit({ origemPagamento: 'SISTEMA_ANTERIOR' }),
    credit({ asaasStatus: 'API_AMBIGUOUS' }),
    credit({ gatewaySettlementSource: 'CNAB240' }),
  ];
  for (const item of blocked) {
    assert.ok(otherCreditCancellationBlockReason(item));
    assert.equal(toggleOtherCreditSelection(new Set(), [item]).size, 0);
  }
});
