import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBRLCurrency,
  formatBRLInput,
  normalizeBRLInput,
  parseBRLInput,
  sanitizeBRLTyping,
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

test('digitação segue centavos automáticos e preserva saldo negativo', () => {
  let current = '';
  for (const digit of '123456') current = sanitizeBRLTyping(`${current}${digit}`, current);
  assert.equal(current, '1.234,56');
  assert.equal(sanitizeBRLTyping(`${current},`, current), current);
  assert.equal(sanitizeBRLTyping(`${current}.`, current), current);
  assert.equal(sanitizeBRLTyping('1.234,5', current), '123,45');
  assert.equal(sanitizeBRLTyping('', current), '');
  assert.equal(sanitizeBRLTyping('-'), '-');
  assert.equal(sanitizeBRLTyping('-1', '-'), '-0,01');
  assert.equal(sanitizeBRLTyping('-0,012', '-0,01'), '-0,12');
  assert.equal(sanitizeBRLTyping('-1.234,56'), '-1.234,56');
  assert.equal(parseBRLInput(sanitizeBRLTyping('-1.234,56')), -1234.56);
});
