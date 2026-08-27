import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContasReceber } from '../../../financeiro.service';
import {
  formatReceivableDate,
  formatNextPendingDueDate,
  formatOptionalCurrency,
  getPersistedGatewayFee,
  getPersistedGatewayNet,
  isPaidThroughAsaas,
  paymentGatewayCode,
  paymentGatewayLabel,
  paymentMethodLabel,
  receivableClassLabel,
  receivableCourseTitle,
  statusScopeLabels,
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

test('reconhece link legado do portal como boleto Banese', () => {
  const baneseLegacyLink = receivable({
    origemPagamento: 'GATEWAY_EAD',
    asaasInvoiceUrl: 'https://universocc.com.br/aluno?module=financeiro&banesePayment=receivable-id',
  });

  assert.equal(paymentGatewayCode(baneseLegacyLink), 'banese_card');
  assert.equal(paymentGatewayLabel(baneseLegacyLink), 'Banese');
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

test('não inventa Pix ou boleto quando o Banese não informou o canal', () => {
  const unknown = receivable({
    status: 'PAGO',
    gatewayProvider: 'banese_card',
    gatewayPaymentMethod: 'BOLETO',
    gatewaySettlementChannel: 'NAO_IDENTIFICADO',
    formaPagamento: 'BOLETO',
  });
  const pix = receivable({
    ...unknown,
    gatewaySettlementChannel: 'PIX',
  });

  assert.equal(paymentMethodLabel(unknown), 'Boleto/Pix — canal não identificado');
  assert.equal(paymentMethodLabel(pix), 'Pix (BolePix)');
});

test('não apresenta próximo vencimento quando o grupo está totalmente quitado', () => {
  assert.equal(formatNextPendingDueDate(0, '2026-07-31'), '—');
  assert.equal(formatNextPendingDueDate(1, '2026-07-31'), '31/07/2026');
});

test('formata datas financeiras vindas como data ou timestamp', () => {
  assert.equal(formatReceivableDate('2026-08-01'), '01/08/2026');
  assert.equal(formatReceivableDate('2026-07-25T13:23:24.852Z'), '25/07/2026');
  assert.equal(formatReceivableDate('valor-inválido'), '—');
});

test('resume curso e turma sem repetir o nome do curso', () => {
  const item = receivable({
    cursoNome: 'Auxiliar Administrativo',
    cursoModalidade: 'EAD',
    turmaNome: 'Auxiliar Administrativo - EAD Turma Unica',
  });

  assert.equal(receivableCourseTitle(item), 'Auxiliar Administrativo — Curso EAD');
  assert.equal(receivableClassLabel(item), 'Turma Única');
});

test('rotula todos os escopos de status incluindo vencidos', () => {
  assert.equal(statusScopeLabels.pending, 'Pendentes');
  assert.equal(statusScopeLabels.received, 'Recebidos');
  assert.equal(statusScopeLabels.overdue, 'Vencidos');
  assert.equal(statusScopeLabels.canceled, 'Cancelados');
  assert.equal(statusScopeLabels.all, 'Todos');
});

