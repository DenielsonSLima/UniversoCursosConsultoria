import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBRLCurrency,
  formatBRLInput,
  normalizeBRLInput,
  parseBRLInput,
} from './saldo-inicial.currency';

test('formata valores para edição em pt-BR', () => {
  assert.equal(formatBRLInput(0), '0,00');
  assert.equal(formatBRLInput(14.9), '14,90');
  assert.equal(formatBRLInput(1234.56), '1.234,56');
});

test('formata valores com a moeda brasileira', () => {
  assert.match(formatBRLCurrency(1234.56), /^R\$\s1\.234,56$/);
});

test('converte entradas brasileiras para número canônico', () => {
  assert.equal(parseBRLInput('1.234,56'), 1234.56);
  assert.equal(parseBRLInput('1.234'), 1234);
  assert.equal(parseBRLInput('R$ 14,90'), 14.9);
  assert.equal(parseBRLInput('-20,15'), -20.15);
  assert.equal(parseBRLInput(''), null);
});

test('normaliza a entrada ao sair do campo', () => {
  assert.equal(normalizeBRLInput('14,9'), '14,90');
  assert.equal(normalizeBRLInput('1234.56'), '1.234,56');
});
