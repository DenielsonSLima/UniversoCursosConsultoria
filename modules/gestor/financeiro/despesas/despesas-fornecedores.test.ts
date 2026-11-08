import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLancamento } from './despesas.mapper.ts';
import { enrichDespesasFornecedorFantasia, getDespesaFornecedorRotulo } from './despesas-fornecedores.ts';

test('consulta nomes em um lote de IDs distintos das despesas autorizadas', async () => {
  const rows = [
    { id: 'despesa-a', fornecedor_id: 'pj-1', fornecedor_nome: 'RAZÃO UM', valor: 120, status: 'PAGO' },
    { id: 'rateio-a', fornecedor_id: 'pj-1', fornecedor_nome: 'RAZÃO UM', valor: 60, status: 'PAGO' },
    { id: 'despesa-b', fornecedor_id: 'pf-2', fornecedor_nome: 'PESSOA DOIS', valor: 80, status: 'PENDENTE' },
    { id: 'despesa-c', fornecedor_id: null, fornecedor_nome: null, valor: 30, status: 'PENDENTE' },
  ];
  const calls: string[][] = [];
  const enriched = await enrichDespesasFornecedorFantasia(rows, async (ids) => {
    calls.push(ids);
    return { data: [{ id: 'pj-1', nome_fantasia: 'PRESTEK' }], error: null };
  });
  assert.deepEqual(calls, [['pj-1', 'pf-2']]);
  assert.equal(getDespesaFornecedorRotulo(mapLancamento(enriched[0])), 'PRESTEK');
  assert.equal(getDespesaFornecedorRotulo(mapLancamento(enriched[1])), 'PRESTEK');
  assert.equal(getDespesaFornecedorRotulo(mapLancamento(enriched[2])), 'PESSOA DOIS');
  assert.equal(getDespesaFornecedorRotulo(mapLancamento(enriched[3])), 'Fornecedor não informado');
  assert.equal(mapLancamento(enriched[0]).fornecedorNome, 'RAZÃO UM');
  assert.deepEqual(enriched.map(({ valor, status }) => ({ valor, status })),
    rows.map(({ valor, status }) => ({ valor, status })));
  assert.equal((rows[0] as any).fornecedor_nome_fantasia, undefined);
});

test('não consulta parceiros quando as linhas não possuem fornecedor', async () => {
  const rows = [{ id: 'sem-fornecedor', fornecedor_id: null }];
  const enriched = await enrichDespesasFornecedorFantasia(rows, async () => {
    assert.fail('Não deveria consultar o catálogo sem IDs de fornecedores.');
  });
  assert.equal(enriched, rows);
});

test('falha de metadado mantém despesa e razão social disponíveis', async () => {
  const rows = [{ id: 'despesa-a', fornecedor_id: 'pj-1', fornecedor_nome: 'RAZÃO UM' }];
  for (const lookup of [
    async () => ({ data: null, error: new Error('Metadado não autorizado') }),
    async () => { throw new Error('Falha de transporte'); },
    async () => ({ data: [], error: null }),
  ]) {
    const enriched = await enrichDespesasFornecedorFantasia(rows, lookup);
    assert.deepEqual(enriched, rows);
    assert.equal(getDespesaFornecedorRotulo(mapLancamento(enriched[0])), 'RAZÃO UM');
  }
});

test('mapper conserva razão social separada do nome fantasia nos dois contratos de leitura', () => {
  const rpc = mapLancamento({
    id: 'rpc', fornecedor_nome: 'RAZÃO RPC', fornecedor_nome_fantasia: ' FANTASIA RPC ',
  });
  const relational = mapLancamento({
    id: 'relacional', parceiros: { nome: 'RAZÃO RELACIONAL', nome_fantasia: 'FANTASIA RELACIONAL' },
  });
  assert.equal(rpc.fornecedorNome, 'RAZÃO RPC');
  assert.equal(rpc.fornecedorNomeFantasia, 'FANTASIA RPC');
  assert.equal(relational.fornecedorNome, 'RAZÃO RELACIONAL');
  assert.equal(relational.fornecedorNomeFantasia, 'FANTASIA RELACIONAL');
  assert.equal(getDespesaFornecedorRotulo({ fornecedorNome: 'RAZÃO', fornecedorNomeFantasia: '   ' }), 'RAZÃO');
});
