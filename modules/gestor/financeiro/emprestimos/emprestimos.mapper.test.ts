import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapEmprestimoFinanceiro,
  mapEmprestimosFinanceiros,
} from './emprestimos.mapper.ts';

test('mapeia o contrato canônico de empréstimo, parcelas e rateios em snake_case', () => {
  const loan = mapEmprestimoFinanceiro({
    id: 'loan-1',
    credor_parceiro_id: 'partner-bank-1',
    credor_nome: 'Banco Exemplo',
    descricao: 'Capital de giro',
    valor_liberado: '1000.00',
    valor_total_divida: '1200.00',
    valor_encargos: '200.00',
    valor_pago: '600.00',
    valor_pendente: '600.00',
    data_liberacao: '2026-08-06',
    conta_credito: {
      id: 'account-1',
      banco: 'Banco Exemplo',
      titular: 'Universo',
      agencia: '0001',
      conta: '12345-6',
      natureza: 'BANCARIA',
    },
    total_parcelas: 2,
    status: 'ATIVO',
    parcelas: [{
      id: 'installment-1',
      numero: 1,
      data_vencimento: '2026-09-06',
      valor_principal: '500.00',
      valor_encargos: '100.00',
      valor_total: '600.00',
      status: 'PAGO',
      valor_pago: '605.50',
      juros_valor: '10.00',
      multa_valor: '2.00',
      desconto_valor: '6.50',
      observacao_baixa: 'Ajuste negociado com o banco.',
      rateios: [{
        id: 'allocation-1',
        polo_id: 'polo-1',
        polo_nome: 'Matriz',
        valor_principal: '500.00',
        valor_encargos: '100.00',
        valor_total: '600.00',
        valor_pago: '605.50',
        status: 'PAGO',
      }],
    }],
  });

  assert.equal(loan.credorNome, 'Banco Exemplo');
  assert.equal(loan.credorParceiroId, 'partner-bank-1');
  assert.equal(loan.valorTotalDivida, 1200);
  assert.equal(loan.valorPago, 600);
  assert.equal(loan.valorPendente, 600);
  assert.equal(loan.parcelas[0]?.dataVencimento, '2026-09-06');
  assert.equal(loan.parcelas[0]?.rateios[0]?.poloNome, 'Matriz');
  assert.equal(loan.parcelas[0]?.rateios[0]?.valorTotal, 600);
  assert.equal(loan.parcelas[0]?.rateios[0]?.valorPago, 605.5);
  assert.equal(loan.parcelas[0]?.valorPago, 605.5);
  assert.equal(loan.parcelas[0]?.jurosValor, 10);
  assert.equal(loan.parcelas[0]?.multaValor, 2);
  assert.equal(loan.parcelas[0]?.descontoValor, 6.5);
  assert.equal(loan.parcelas[0]?.observacaoBaixa, 'Ajuste negociado com o banco.');
  assert.equal(loan.contaCredito?.id, 'account-1');
  assert.equal(loan.contaCredito?.conta, '12345-6');
});

test('aceita a lista JSON serializada sem inventar valores financeiros', () => {
  const loans = mapEmprestimosFinanceiros(JSON.stringify([{
    id: 'loan-2',
    descricao: 'Contrato B',
    valor_liberado: 300,
    valor_total_divida: 330,
    parcelas: [],
  }]));

  assert.equal(loans.length, 1);
  assert.equal(loans[0]?.valorLiberado, 300);
  assert.equal(loans[0]?.valorTotalDivida, 330);
  assert.equal(loans[0]?.valorPago, undefined);
  assert.equal(loans[0]?.valorPendente, undefined);
  assert.equal(loans[0]?.parcelas.length, 0);
});

test('preserva o estado de cancelamento e baixa devolvido pelo backend', () => {
  const loan = mapEmprestimoFinanceiro({
    id: 'loan-lifecycle-1',
    descricao: 'Contrato cancelado',
    status: 'CANCELADO',
    possui_baixa: true,
    cancelamento_motivo: 'Operação desfeita',
    cancelado_em: '2026-08-11T12:00:00.000Z',
    estornado_em: '2026-08-11T12:00:00.000Z',
  });

  assert.equal(loan.status, 'CANCELADO');
  assert.equal(loan.possuiBaixa, true);
  assert.equal(loan.cancelamentoMotivo, 'Operação desfeita');
  assert.equal(loan.estornadoEm, '2026-08-11T12:00:00.000Z');
});

test('preserva os polos canônicos retornados na criação para o escopo de cache', () => {
  const loan = mapEmprestimoFinanceiro({
    id: 'loan-3',
    descricao: 'Contrato C',
    rateio_polos: [
      { polo_id: 'polo-matriz', nome: 'Matriz' },
      { polo_id: 'polo-norte', nome: 'Polo Norte' },
      { polo_id: 'polo-norte', nome: 'Polo Norte' },
    ],
  });

  assert.deepEqual(loan.rateioPoloIds, ['polo-matriz', 'polo-norte']);
});

test('mapeia empréstimo próprio do polo sem inventar rateio no cliente', () => {
  const loan = mapEmprestimoFinanceiro({
    id: 'loan-polo-1',
    polo_responsavel_id: 'polo-norte',
    polo_responsavel_nome: 'Polo Norte',
    polo_responsavel_is_matriz: false,
    rateio_modo: 'SEM_RATEIO',
    descricao: 'Reforma do polo',
    parcelas: [],
  });

  assert.equal(loan.poloResponsavelId, 'polo-norte');
  assert.equal(loan.poloResponsavelNome, 'Polo Norte');
  assert.equal(loan.poloResponsavelIsMatriz, false);
  assert.equal(loan.rateioModo, 'SEM_RATEIO');
  assert.deepEqual(loan.rateioPoloIds, []);
});
