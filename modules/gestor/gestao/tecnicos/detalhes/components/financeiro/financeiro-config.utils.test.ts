import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPercentageBR,
} from './financeiro-config.utils';

test('formata a taxa diária oficial retornada pelo servidor', () => {
  assert.equal(formatPercentageBR(0.033333), '0,0333');
});

test('formata percentuais inteiros sem casas desnecessárias', () => {
  assert.equal(formatPercentageBR(2), '2');
});
