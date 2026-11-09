import test from 'node:test';
import assert from 'node:assert/strict';
import { despesaSugestaoReducer as reduce, initialSugestaoState } from './despesa-sugestao.model.ts';

const sugestao = { id: 'anterior', descricao: 'Internet mensal', valorBase: 120, categoriaId: 'internet' };
const select = (scope = 'matriz:fixa:credor-a') => reduce(initialSugestaoState, { type: 'selecionar', scope });
const apply = (state = select(), value = sugestao, categoriasAtivas = ['internet']) => reduce(state, {
  type: 'aplicar', scope: state.scope, sugestao: value, categoriasAtivas,
});

test('sugere somente descrição, valor-base e categoria ativa de uma despesa já paga', () => {
  const state = apply(select(), {
    ...sugestao, status: 'PAGO', dataVencimento: '2020-01-01', valorPago: 135,
    jurosValor: 15, contaBancariaId: 'banco', anexoPath: 'comprovante.pdf',
  } as typeof sugestao);
  assert.deepEqual(state.campos, { descricao: 'Internet mensal', valor: '120,00', categoriaId: 'internet' });
  assert.equal(state.aplicados, 3);
  assert.deepEqual(Object.keys(state.campos).sort(), ['categoriaId', 'descricao', 'valor']);
});

test('preserva edições e limpeza manual feitas antes de a consulta terminar', () => {
  let state = select();
  state = reduce(state, { type: 'editar', campo: 'valor', value: '150,00' });
  state = reduce(state, { type: 'editar', campo: 'descricao', value: '' });
  state = apply(state);
  assert.deepEqual(state.campos, { descricao: '', valor: '150,00', categoriaId: 'internet' });
  assert.equal(state.aplicados, 1);
});

test('troca de credor limpa sugestões anteriores e conserva somente edições manuais', () => {
  let state = apply();
  state = reduce(state, { type: 'editar', campo: 'valor', value: '140,00' });
  state = reduce(state, { type: 'selecionar', scope: 'matriz:fixa:credor-b' });
  assert.deepEqual(state.campos, { descricao: '', valor: '140,00', categoriaId: '' });
  state = apply(state, { id: 'b', descricao: 'Água', valorBase: 50, categoriaId: 'agua' }, ['agua']);
  assert.deepEqual(state.campos, { descricao: 'Água', valor: '140,00', categoriaId: 'agua' });
});

test('ignora resposta atrasada de outro credor, polo ou tipo', () => {
  const state = select('filial:variavel:credor-b');
  assert.equal(reduce(state, {
    type: 'aplicar', scope: 'matriz:fixa:credor-a', sugestao, categoriasAtivas: ['internet'],
  }), state);
});

test('refetch não reaplica nem sobrescreve correções depois do primeiro preenchimento', () => {
  let state = apply();
  state = reduce(state, { type: 'editar', campo: 'categoriaId', value: 'outra' });
  assert.equal(apply(state, { ...sugestao, descricao: 'Resposta posterior' }), state);
  assert.equal(state.campos.categoriaId, 'outra');
});

test('parceiro sem histórico não mantém dados automáticos de outro parceiro', () => {
  const state = reduce(apply(), { type: 'selecionar', scope: 'matriz:fixa:novo' });
  const result = reduce(state, { type: 'aplicar', scope: state.scope, sugestao: null, categoriasAtivas: [] });
  assert.deepEqual(result.campos, initialSugestaoState.campos);
  assert.equal(result.concluida, true);
  assert.equal(result.encontrada, false);
});

test('categoria inativa é sinalizada, sem impedir descrição e valor-base', () => {
  const state = apply(select(), sugestao, []);
  assert.equal(state.campos.categoriaId, '');
  assert.equal(state.categoriaIndisponivel, true);
  assert.equal(state.campos.valor, '120,00');
});

test('valor inválido não é sugerido; valores grandes são formatados sem mudar o valor-base', () => {
  for (const value of [NaN, Infinity, -1, 0]) {
    assert.equal(apply(select(), { ...sugestao, valorBase: value }).campos.valor, '');
  }
  assert.equal(apply(select(), { ...sugestao, valorBase: 1234.56 }).campos.valor, '1.234,56');
});

test('remover credor descarta a sugestão e selecionar novamente permite nova consulta', () => {
  let state = reduce(apply(), { type: 'selecionar', scope: '' });
  assert.deepEqual(state.campos, initialSugestaoState.campos);
  state = reduce(state, { type: 'selecionar', scope: 'matriz:fixa:credor-a' });
  assert.equal(apply(state).campos.descricao, sugestao.descricao);
});
