import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtherCreditRow } from './OtherCreditRow';
import type { ContasReceber } from '../financeiro.types';

const item = {
  id: 'proesc-receipt', poloId: 'polo', descricao: 'Mensalidade importada',
  valor: 279.90, valorPago: 260, dataVencimento: '2026-09-16',
  dataPagamento: '2026-09-04', status: 'PAGO', categoria: 'OUTROS_CREDITOS',
  origemPagamento: 'SISTEMA_ANTERIOR', clienteNome: 'Aluno de teste',
  descontoAplicado: 19.90, jurosAplicados: 0, multaAplicada: 0,
  acrescimoAplicado: 0, diferencaNaoDiscriminada: 0,
  composicaoStatus: 'CALCULADO_REGRA_INFORMADA_PROESC',
} as ContasReceber;
const model = {
  openReceiveModal() {}, openPaymentModal() {}, copyLink() {},
  syncMutation: { isPending: false, mutate() {} },
};
const capabilities = { sourceSystem: 'BANESE', provenanceKind: 'NATIVE_ISSUED', canSettle: true, canCancel: true,
  canEmit: false, canOpenExisting: true, canReconcile: true, readOnlyReason: null } as const;
const markup = (receipt: ContasReceber, onOpenPlan?: (id: string) => void) => renderToStaticMarkup(
  <table><tbody><OtherCreditRow item={receipt} index={0} model={model as any} onOpenPlan={onOpenPlan} /></tbody></table>,
);
const render = (receipt: ContasReceber, onOpenPlan?: (id: string) => void) => markup(receipt, onOpenPlan).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('Outros Créditos discrimina Proesc sem exigir identificador Banese', () => {
  const text = render(item);
  assert.match(text, /Origem: Proesc/);
  assert.match(text, /Desconto: R\$ 19,90/);
  assert.match(text, /Juros: R\$ 0,00/);
  assert.match(text, /Multa: R\$ 0,00/);
  assert.match(text, /Recebido: R\$ 260,00/);
  assert.match(text, /Calculado pelas regras informadas/);
  assert.doesNotMatch(text, /Gerar link|Desconto expirado|Conta local/);
});

test('divergência calculada fica visível e não substitui o recebido', () => {
  const text = render({ ...item, valorPago: 250, diferencaNaoDiscriminada: -10 });
  assert.match(text, /Recebido: R\$ 250,00/);
  assert.match(text, /Diferença (?:não discriminada|a conferir): -R\$ 10,00/);
  assert.match(text, /Desconto: R\$ 19,90/);
});


test('cobrança importada pendente não oferece nova emissão ou caixa Banese', () => {
  const text = render({ ...item, status: 'PENDENTE' });
  assert.doesNotMatch(text, /Gerar link|Abrir caixa/);
});

test('cobrança Banese permite abrir o caixa existente', () => {
  const text = render({ ...item, origemPagamento: 'BANESE', gatewayProvider: 'banese_card', asaasPaymentId: 'bank-id', status: 'PENDENTE', operationCapabilities: capabilities });
  assert.match(text, /Abrir caixa/);
  assert.doesNotMatch(text, /Gerar link|Atualizar/);
});

test('título de carnê oferece abertura do plano e concentra emissão no fluxo de retomada', () => {
  const installment = { ...item, status: 'PENDENTE', origemPagamento: 'LOCAL', outrosCreditosPlanoId: 'plan' } as ContasReceber;
  const pending = render(installment, () => {});
  assert.match(pending, /Abrir carnê/);
  assert.doesNotMatch(pending, /Gerar link/);
  const issued = render({ ...installment, gatewayProvider: 'banese_card', asaasPaymentId: 'bank-id', operationCapabilities: capabilities }, () => {});
  assert.match(issued, /Abrir carnê/);
  assert.match(issued, /Abrir caixa/);
});


test('saldo parcial mantém recebimento e histórico sem abrir ou emitir cobrança original', () => {
  const paymentSummary = { originalAmount: '100.00', previouslyPaid: '70.00', remainingBefore: '30.00', status: 'PENDENTE', hasEvents: true };
  for (const gatewayProvider of ['banese_card', 'asaas', undefined]) {
    const html = markup({ ...item, status: 'PENDENTE', origemPagamento: 'LOCAL', gatewayProvider, paymentSummary,
      asaasInvoiceUrl: 'https://example.test/cobranca-encerrada', operationCapabilities: { ...capabilities, canEmit: true } });
    assert.match(html, /Histórico|Receber saldo/);
    assert.doesNotMatch(html, /Gerar link|Abrir caixa|Copiar link bancário|Abrir cobrança|href=/);
  }
});

test('emissão e abertura Banese exigem capability explícita, preservando link Asaas legado', () => {
  const local = { ...item, status: 'PENDENTE', origemPagamento: 'LOCAL' } as ContasReceber;
  assert.doesNotMatch(render(local), /Gerar link/);
  assert.match(render({ ...local, operationCapabilities: { ...capabilities, canEmit: true } }), /Gerar link/);
  const bank = { ...local, gatewayProvider: 'banese_card', asaasPaymentId: 'bank-id', asaasInvoiceUrl: 'https://example.test/cobranca' };
  assert.doesNotMatch(markup(bank), /Abrir caixa|Copiar link bancário|Abrir cobrança/);
  assert.match(markup({ ...bank, operationCapabilities: capabilities }), /Copiar link bancário/);
  assert.doesNotMatch(markup({ ...bank, asaasStatus: 'CANCELED', operationCapabilities: capabilities }), /Abrir caixa|Copiar link bancário|Abrir cobrança/);
  assert.match(markup({ ...bank, gatewayProvider: 'asaas', operationCapabilities: { ...capabilities, canOpenExisting: false } }), /Abrir cobrança/);
});
