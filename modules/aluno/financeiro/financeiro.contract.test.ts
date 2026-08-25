import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAlunoFinancialListPayload,
  parseAlunoFinancialReceiptPayload,
} from './financeiro.contract.ts';
import {
  alunoEadPaymentErrorMessage,
  alunoFinancialErrorMessage,
} from './financeiro.presentation.ts';

const financialSummary = (paidValue: number) => ({
  baseValue: 100,
  paidValue,
  punctualDiscount: 0,
  totalUntilDue: 100,
  interestPercent: 0,
  interestValue: 0,
  lateFeeValue: 0,
  totalWithLate: 100,
  highlightValue: paidValue,
  highlightLabel: 'Valor pago',
  hasDiscount: false,
  hasLateCharge: false,
  canLateCharge: false,
});

const item = (paidValue: number, dependency = false) => ({
  id: '00000000-0000-4000-8000-000000000001',
  cliente_id: '10000000-0000-4000-8000-000000000001',
  matricula_id: null,
  turma_id: null,
  polo_id: null,
  descricao: 'Pagamento acadêmico',
  categoria: 'Mensalidade',
  tipo_lancamento: dependency ? 'DISCIPLINA' : 'PARCELA',
  parcela_numero: 1,
  valor: 100,
  valor_pago: paidValue,
  valueOutstanding: 0,
  data_vencimento: '2026-08-24',
  data_pagamento: '2026-08-25',
  status: 'PAGO',
  statusCode: 'PAGO',
  statusLabel: 'Pago',
  isOverdue: false,
  receiptEligible: true,
  forma_pagamento: 'PIX',
  origem_pagamento: 'MANUAL',
  modalidade: dependency ? 'DISCIPLINA' : 'TECNICO',
  cursoId: null,
  cursoNome: dependency ? '' : 'Curso Técnico',
  turmaNome: dependency ? '' : 'Turma A',
  chargeKind: dependency ? 'Disciplina' : 'Mensalidade 1',
  isIsolatedDependency: dependency,
  asaas_invoice_url: null,
  asaas_status: null,
  asaas_transaction_receipt_url: null,
  gateway_provider: null,
  gateway_environment: null,
  gateway_payment_method: null,
  gateway_payment_id: null,
  gateway_status: null,
  gateway_bank_slip_url: null,
  gateway_invoice_url: null,
  gateway_boleto_linha_digitavel: null,
  gateway_boleto_codigo_barras: null,
  gateway_boleto_nosso_numero: null,
  turmas: null,
  parceiros: { nome: 'Aluno Teste', cpf_cnpj: null },
  financial_summary: financialSummary(paidValue),
});

const payload = (paidValue: number, dependency = false) => ({
  items: [item(paidValue, dependency)],
  summary: {
    totalPaid: paidValue,
    totalPending: 0,
    recordCount: 1,
    openByModality: [],
  },
  filters: { counts: { ABERTO: 0, ATRASADO: 0, PAGO: 1, TODOS: 1 } },
  pagination: { currentPage: 1, pageSize: 8, totalItems: 1, totalPages: 1 },
});

test('parser preserva valor pago zero e parcial sem fallback', () => {
  const zero = parseAlunoFinancialListPayload(payload(0));
  const partial = parseAlunoFinancialListPayload(payload(40));
  assert.equal(zero.items[0].valor_pago, 0);
  assert.equal(zero.items[0].financialSummary.paidValue, 0);
  assert.equal(zero.summary.totalPaid, 0);
  assert.equal(partial.items[0].valor_pago, 40);
  assert.equal(partial.items[0].financialSummary.paidValue, 40);
  assert.equal(partial.summary.totalPaid, 40);
});

test('dependência aceita curso e turma vazios sem enfraquecer o restante do shape', () => {
  const parsed = parseAlunoFinancialListPayload(payload(25, true));
  assert.equal(parsed.items[0].cursoNome, '');
  assert.equal(parsed.items[0].turmaNome, '');
  assert.equal(parsed.items[0].chargeKind, 'Disciplina');
  assert.throws(
    () => parseAlunoFinancialListPayload({ ...payload(25), summary: null }),
    /resumo financeiro/i,
  );
});

test('shape inválido falha explicitamente e não fabrica resumo zerado', () => {
  assert.throws(() => parseAlunoFinancialListPayload(null), /objeto válido/i);
  assert.throws(
    () => parseAlunoFinancialListPayload({ ...payload(0), items: null }),
    /lista válida/i,
  );
});

test('payload canônico vazio é aceito sem fabricar lançamentos', () => {
  const parsed = parseAlunoFinancialListPayload({
    items: [],
    summary: {
      totalPaid: 0,
      totalPending: 0,
      recordCount: 0,
      openByModality: [],
    },
    filters: { counts: { ABERTO: 0, ATRASADO: 0, PAGO: 0, TODOS: 0 } },
    pagination: { currentPage: 1, pageSize: 8, totalItems: 0, totalPages: 1 },
  });
  assert.deepEqual(parsed.items, []);
  assert.deepEqual(parsed.summary, {
    totalPaid: 0,
    totalPending: 0,
    recordCount: 0,
    openByModality: [],
  });
  assert.deepEqual(parsed.filters.counts, {
    ABERTO: 0,
    ATRASADO: 0,
    PAGO: 0,
    TODOS: 0,
  });
  assert.deepEqual(parsed.pagination, {
    currentPage: 1,
    pageSize: 8,
    totalItems: 0,
    totalPages: 1,
  });
});

test('mensagem sensível de PostgREST nunca chega à apresentação', () => {
  const visible = alunoFinancialErrorMessage(new Error(
    'permission denied for table contas_receber at policy aluno_internal_42',
  ));
  assert.equal(
    visible,
    'Não foi possível carregar o Financeiro do Aluno. Verifique sua conexão e tente novamente.',
  );
  assert.doesNotMatch(visible, /contas_receber|policy|permission denied/i);
});

test('checkout EAD e janela Banese removem detalhes remotos sensíveis', () => {
  for (const sensitive of [
    'permission denied for table contas_receber at policy aluno_internal_42',
    'missing ASAAS_API_KEY in gateway config production',
    'stack: banese-student-payment service_role_secret',
  ]) {
    const checkout = alunoEadPaymentErrorMessage(new Error(sensitive), 'CHECKOUT');
    const boleto = alunoEadPaymentErrorMessage(new Error(sensitive), 'BOLETO');
    assert.equal(checkout, 'Não foi possível preparar o pagamento EAD.');
    assert.equal(boleto, 'Não foi possível abrir o boleto Banese.');
    assert.doesNotMatch(`${checkout} ${boleto}`, /policy|config|secret|contas_receber/i);
  }
  assert.equal(
    alunoEadPaymentErrorMessage(
      new Error('O navegador bloqueou a nova aba do boleto.'),
      'BOLETO',
    ),
    'O navegador bloqueou a nova aba do boleto.',
  );
});

test('snapshot de recibo aceita valor efetivo zero e recusa status não pago', () => {
  const receipt = {
    model: {
      key: 'recibo',
      source: 'MODELO_RECIBO_PADRAO',
      revision: 1,
      orientation: 'portrait',
      documentKind: 'RECIBO_PAGAMENTO_ALUNO',
    },
    receipt: {
      id: item(0).id,
      receiptNumber: '00000000',
      title: 'Recibo de pagamento',
      statusCode: 'PAGO',
      statusLabel: 'Pago',
      description: 'Pagamento acadêmico',
      category: 'Mensalidade',
      payerName: 'Aluno Teste',
      payerDocument: null,
      courseLabel: 'Pagamento acadêmico',
      valueExpected: 100,
      valuePaid: 0,
      valueOutstanding: 0,
      dueDate: '2026-08-24',
      dueDateLabel: '24/08/2026',
      paidAt: '2026-08-25',
      paidAtLabel: '25/08/2026',
      paymentMethod: 'PIX',
      poloName: 'Polo Teste',
      poloLocation: 'Maceió - AL',
      declaration: 'Declaramos o recebimento.',
      footerNote: 'Emitido automaticamente.',
      emittedAt: '2026-08-25T10:00:00-03:00',
      emittedAtLabel: '25/08/2026 10:00',
    },
    institution: {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Universo Cursos e Consultoria',
      cnpj: null,
      address: null,
      number: null,
      complement: null,
      neighborhood: null,
      city: 'Maceió',
      state: 'AL',
      postalCode: null,
      phone: null,
      email: null,
      isHeadquarters: false,
      unitName: 'Polo Teste',
      logoUrl: null,
    },
    watermark: {
      enabled: true,
      label: 'Universo',
      imageUrl: null,
      opacity: 0.1,
      scale: 50,
      rotate: true,
      source: 'FALLBACK_MODELO_RECIBO',
    },
  };
  assert.equal(parseAlunoFinancialReceiptPayload(receipt).receipt.valuePaid, 0);
  assert.throws(
    () => parseAlunoFinancialReceiptPayload({
      ...receipt,
      receipt: { ...receipt.receipt, statusCode: 'ABERTO' },
    }),
    /não confirmou a baixa/i,
  );
});
