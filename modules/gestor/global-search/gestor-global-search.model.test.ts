import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGlobalSearchAccessKey,
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

test('cria a chave de acesso do gestor global quando allowedPoloIds é null', () => {
  const key = buildGlobalSearchAccessKey({
    dashboardAccessKey: 'dashboard:gestor-1',
    contextId: 'context-1',
    scope: { isGlobal: true, allowedPoloIds: null },
  });

  assert.deepEqual(JSON.parse(key), {
    dashboardAccessKey: 'dashboard:gestor-1',
    contextId: 'context-1',
    isGlobal: true,
    allowedPoloIds: null,
  });
});

test('ordena polos sem alterar a lista original ao criar a chave', () => {
  const allowedPoloIds = ['polo-b', 'polo-a'];
  const key = buildGlobalSearchAccessKey({
    dashboardAccessKey: 'dashboard:gestor-2',
    scope: { isGlobal: false, allowedPoloIds },
  });

  assert.deepEqual(JSON.parse(key).allowedPoloIds, ['polo-a', 'polo-b']);
  assert.deepEqual(allowedPoloIds, ['polo-b', 'polo-a']);
});
