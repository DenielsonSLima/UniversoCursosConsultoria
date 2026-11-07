import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currencyInputToCents,
  formatCurrencyInput,
  sanitizeCurrencyInput,
} from './currency-input.ts';
import {
  formatCurrencyTyping as expenseTyping,
  parseCurrencyInput as parseExpense,
} from '../../gestor/financeiro/despesas/components/despesa-form.utils.ts';
import {
  sanitizeCurrencyInput as receivableTyping,
} from '../../gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.ts';

test('despesas e contas a receber compartilham a mesma máscara de centavos', () => {
  assert.equal(expenseTyping, sanitizeCurrencyInput);
  assert.equal(receivableTyping, sanitizeCurrencyInput);

  for (const mask of [expenseTyping, receivableTyping]) {
    let value = '';
    const displayed: string[] = [];
    for (const digit of '123456') {
      value = mask(`${value}${digit}`, value);
      displayed.push(value);
    }
    assert.deepEqual(displayed, ['0,01', '0,12', '1,23', '12,34', '123,45', '1.234,56']);
    assert.equal(parseExpense(value), 1234.56);
    assert.equal(currencyInputToCents(value), 123456);
  }
});

test('vírgula e ponto adicionais preservam o valor já digitado', () => {
  for (const previous of ['0,01', '3.333,00', '1.234,56']) {
    for (const separator of [',', '.']) {
      assert.equal(sanitizeCurrencyInput(`${previous}${separator}`, previous), previous);
    }
  }
  assert.equal(sanitizeCurrencyInput(',', ''), '');
  assert.equal(sanitizeCurrencyInput('.', ''), '');
});

test('backspace desloca os centavos, permite zerar e limpar o campo', () => {
  assert.equal(sanitizeCurrencyInput('1.234,5', '1.234,56'), '123,45');
  assert.equal(sanitizeCurrencyInput('0,0', '0,01'), '');
  assert.equal(sanitizeCurrencyInput('', '3.333,00'), '');
  assert.equal(sanitizeCurrencyInput('0', '3.333,00'), '');
  assert.equal(sanitizeCurrencyInput('0', ''), '0,00');
  assert.equal(formatCurrencyInput(''), '0,00');
});

test('seleção total e colagem aceitam os mesmos centavos em BRL e USD', () => {
  assert.equal(sanitizeCurrencyInput('5', '1.234,56'), '0,05');
  for (const pasted of ['123456', '1.234,56', 'R$ 1.234,56', '1,234.56', '$1,234.56']) {
    const formatted = sanitizeCurrencyInput(pasted, '9,99');
    assert.equal(formatted, '1.234,56');
    assert.equal(currencyInputToCents(formatted), 123456);
  }
});

test('entrada sem dígitos e acima do limite preserva o último valor', () => {
  assert.equal(sanitizeCurrencyInput('abc', '12,34'), '12,34');
  assert.equal(sanitizeCurrencyInput('90000000000000001', '12,34'), '12,34');
  assert.equal(currencyInputToCents('1,2,3'), null);
  assert.equal(currencyInputToCents('-1,00'), null);
});
