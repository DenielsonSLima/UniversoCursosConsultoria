import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapEmprestimoFinanceiro,
  mapEmprestimosFinanceiros,
} from './emprestimos.mapper.ts';

test('mapeia o contrato canônico de empréstimo, parcelas e rateios em snake_case', () => {
  const loan = mapEmprestimoFinanceiro({
    id: 'loan-1',
    credor_nome: 'Banco Exemplo',
    descricao: 'Capital de giro',
    valor_liberado: '1000.00',
    valor_total_divida: '1200.00',
    valor_encargos: '200.00',
    data_liberacao: '2026-08-06',
    total_parcelas: 2,
    status: 'ATIVO',
    parcelas: [{
      id: 'installment-1',
      numero: 1,
      data_vencimento: '2026-09-06',
      valor_principal: '500.00',
      valor_encargos: '100.00',
      valor_total: '600.00',
      status: 'PENDENTE',
      rateios: [{
        id: 'allocation-1',
        polo_id: 'polo-1',
        polo_nome: 'Matriz',
        valor_principal: '500.00',
        valor_encargos: '100.00',
        valor_total: '600.00',
        status: 'PENDENTE',
      }],
    }],
  });

  assert.equal(loan.credorNome, 'Banco Exemplo');
  assert.equal(loan.valorTotalDivida, 1200);
  assert.equal(loan.parcelas[0]?.dataVencimento, '2026-09-06');
  assert.equal(loan.parcelas[0]?.rateios[0]?.poloNome, 'Matriz');
  assert.equal(loan.parcelas[0]?.rateios[0]?.valorTotal, 600);
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
  assert.equal(loans[0]?.parcelas.length, 0);
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
