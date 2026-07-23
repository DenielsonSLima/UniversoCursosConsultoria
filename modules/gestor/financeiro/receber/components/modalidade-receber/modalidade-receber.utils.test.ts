import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContasReceber } from '../../../financeiro.service';
import {
  formatOptionalCurrency,
  getPersistedGatewayFee,
  getPersistedGatewayNet,
  isPaidThroughAsaas,
  paymentGatewayCode,
  paymentGatewayLabel,
} from './modalidade-receber.utils';

const receivable = (overrides: Partial<ContasReceber> = {}): ContasReceber => ({
  id: 'receivable-id',
  poloId: 'polo-id',
  descricao: 'Parcela 1',
  valor: 100,
  dataVencimento: '2026-07-22',
  status: 'PENDENTE',
  categoria: 'MENSALIDADE',
  ...overrides,
});

test('prioriza taxa e líquido persistidos pelo backend', () => {
  const item = receivable({
    gatewayProvider: 'asaas',
    formaPagamento: 'CARTAO',
    taxa: 7.25,
    valorLiquido: 92.75,
  });

  assert.equal(getPersistedGatewayFee(item), 7.25);
  assert.equal(getPersistedGatewayNet(item), 92.75);
});

test('não estima taxa ou líquido quando o backend não persistiu os valores', () => {
  const item = receivable({
    gatewayProvider: 'asaas',
    formaPagamento: 'BOLETO',
  });

  assert.equal(getPersistedGatewayFee(item), null);
  assert.equal(getPersistedGatewayNet(item), null);
  assert.equal(formatOptionalCurrency(getPersistedGatewayFee(item)), '—');
  assert.equal(
    formatOptionalCurrency(getPersistedGatewayNet(item), 'Não informado'),
    'Não informado',
  );
  assert.equal(item.taxa, undefined);
  assert.equal(item.valorLiquido, undefined);
});

test('identifica os provedores somente para apresentação e ações da cobrança', () => {
  const banese = receivable({ gatewayProvider: 'banese_card' });
  const mercadoPago = receivable({ origemPagamento: 'MERCADO_PAGO' });

  assert.equal(paymentGatewayCode(banese), 'banese_card');
  assert.equal(paymentGatewayLabel(banese), 'Banese');
  assert.equal(paymentGatewayCode(mercadoPago), 'mercado_pago');
  assert.equal(paymentGatewayLabel(mercadoPago), 'Mercado Pago');
});

test('não apresenta comprovante Asaas para cobrança paga de outro provedor', () => {
  const banese = receivable({
    status: 'PAGO',
    gatewayProvider: 'banese_card',
    asaasStatus: 'RECEIVED',
    asaasTransactionReceiptUrl: 'https://example.test/receipt',
  });
  const asaas = receivable({
    status: 'PAGO',
    gatewayProvider: 'asaas',
    asaasStatus: 'RECEIVED',
  });

  assert.equal(isPaidThroughAsaas(banese), false);
  assert.equal(isPaidThroughAsaas(asaas), true);
});
