import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGlobalSearchResultKey,
  formatGlobalSearchClass,
  formatGlobalSearchDocument,
  formatGlobalSearchPolo,
} from './gestor-global-search.model.ts';

test('formata CPF e CNPJ no padrão brasileiro', () => {
  assert.equal(formatGlobalSearchDocument('05853438530'), '058.534.385-30');
  assert.equal(formatGlobalSearchDocument('13278137000154'), '13.278.137/0001-54');
});

test('compõe polo, turma e chave sem depender do polo atualmente selecionado', () => {
  assert.equal(formatGlobalSearchPolo({ poloCity: 'Aquidabã', poloState: 'se' }), 'Aquidabã/SE');
  assert.equal(formatGlobalSearchPolo({ poloCity: null, poloState: null }), 'Cadastro global');
  assert.equal(formatGlobalSearchClass({ classCode: 'T-01', className: 'Radiologia', otherClasses: 2 }), 'T-01 — Radiologia +2 outras');
  assert.equal(buildGlobalSearchResultKey('partner-1', 'polo-2'), 'partner-1:polo-2');
});
