import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPjScope, pjPoloSelection } from './pj-polo-scope.ts';
import { MATRIZ_POLO_ID } from './parceiros.constants.ts';

test('todos por padrão somente na matriz para gestão global', () => {
  assert.equal(defaultPjScope(MATRIZ_POLO_ID, true), 'all');
  assert.equal(defaultPjScope(MATRIZ_POLO_ID, false), 'active');
  assert.equal(defaultPjScope('filial', true), 'active');
  assert.equal(defaultPjScope(null, true), 'active');
});
test('adicionar polos preserva principal e remove duplicados', () => {
  assert.deepEqual(pjPoloSelection(['b', 'a', 'b'], 'a'), {poloId:'a', poloIds:['b','a']});
});
test('reduzir escopo escolhe principal válido e não deixa array vazio', () => {
  assert.deepEqual(pjPoloSelection(['b'], 'a'), {poloId:'b', poloIds:['b']});
  assert.throws(() => pjPoloSelection([], 'a'), /pelo menos/);
});
