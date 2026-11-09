import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDespesaGroups, getDespesaGroupIdentity } from './despesa-grouping.model.ts';
import type { DespesaLancamento } from '../despesas.types';

const item = (id: string, date: string, extra = {}) => ({
  id, dataVencimento: date, fornecedorId: 'a', fornecedorNome: 'Empresa A Ltda',
  fornecedorNomeFantasia: 'Marca A', categoriaFinanceiraId: 'internet', categoriaNome: 'Internet',
  valor: 100, ...extra,
}) as DespesaLancamento;

test('mês de vencimento separa anos e ordena dezembro antes de janeiro seguinte', () => {
  const items = [item('jan', '2027-01-05'), item('dez', '2026-12-05'), item('jan-ant', '2026-01-05')];
  const groups = buildDespesaGroups(items, [], 'mes');
  assert.deepEqual(groups.map((group) => group.key), ['2026-01', '2026-12', '2027-01']);
  assert.equal(groups[1].label, 'dezembro de 2026');
  assert.equal(groups[2].label, 'janeiro de 2027');
  assert.deepEqual(items.map((row) => row.id), ['jan', 'dez', 'jan-ant']);
});

test('fornecedor usa ID, mantém empresas homônimas distintas e prioriza fantasia', () => {
  const groups = buildDespesaGroups([
    item('a', '2027-01-05'), item('b', '2027-02-05'),
    item('c', '2027-01-05', { fornecedorId: 'b' }),
  ], [], 'fornecedor');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, 'Marca A');
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].items.length, 1);
});

test('totais, pagamentos parciais e quantidade vêm do resumo canônico', () => {
  const groups = buildDespesaGroups([item('a', '2027-01-05', { valor: 999 })], [{
    groupKey: '2027-01', groupLabel: 'janeiro de 2027', categoriaNome: '',
    totalValue: 120, paidValue: 30, itemCount: 1,
  }], 'mes');
  assert.equal(groups[0].total, 120);
  assert.equal(groups[0].pago, 30);
  assert.equal(groups[0].count, 1);
  assert.equal(buildDespesaGroups([item('a', '2027-01-05')], [], 'mes')[0].total, undefined);
});

test('grupos sem fornecedor, sem data e categorias legadas continuam representáveis', () => {
  const missing = item('a', '', { fornecedorId: undefined, fornecedorNomeFantasia: undefined });
  assert.equal(getDespesaGroupIdentity(missing, 'mes').key, '__sem_vencimento__');
  assert.deepEqual(getDespesaGroupIdentity(missing, 'fornecedor'), {
    key: '__sem_fornecedor__', label: 'Fornecedor não informado',
  });
  const groups = buildDespesaGroups([missing], [{
    categoriaId: 'internet', categoriaNome: 'Internet', totalValue: 100, paidValue: 0, itemCount: 1,
  }], 'categoria');
  assert.equal(groups[0].total, 100);
  assert.equal(groups[0].label, 'Internet');
});
