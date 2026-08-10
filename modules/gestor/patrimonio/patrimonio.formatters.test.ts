import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePatrimonioTotalCents,
  formatPatrimonioCents,
  formatPatrimonioCurrency,
  formatPatrimonioCurrencyInput,
  formatPatrimonioCurrencyTyping,
  parsePatrimonioCurrencyToCents,
  parsePatrimonioQuantity,
  PATRIMONIO_MAX_TOTAL_CENTS,
  PATRIMONIO_MAX_UNIT_CENTS,
} from './patrimonio.formatters';

test('formata a digitação monetária em reais e preserva decimais intermediários', () => {
  assert.equal(formatPatrimonioCurrencyInput('800'), '800,00');
  assert.equal(formatPatrimonioCurrencyInput('0'), '0,00');
  let typed = '';
  for (const character of '800,5') {
    typed = formatPatrimonioCurrencyTyping(`${typed}${character}`, typed);
  }
  assert.equal(typed, '800,5');
  assert.equal(formatPatrimonioCurrencyInput(typed), '800,50');
  assert.equal(formatPatrimonioCurrencyTyping('1234', '123'), '1.234');
  assert.equal(formatPatrimonioCurrencyTyping('1234.56', ''), '1.234,56');
});

test('aceita colagem brasileira e converte exatamente para centavos', () => {
  assert.equal(parsePatrimonioCurrencyToCents('R$ 1.234,56'), 123_456n);
  assert.equal(parsePatrimonioCurrencyToCents('1234.56'), 123_456n);
  assert.equal(parsePatrimonioCurrencyToCents('0,00'), 0n);
  assert.equal(parsePatrimonioCurrencyToCents('12,345'), null);
  assert.equal(parsePatrimonioCurrencyToCents('-10,00'), null);
  assert.equal(formatPatrimonioCents(123_456n), 'R$ 1.234,56');
  assert.equal(formatPatrimonioCurrency('99999999999999.99'), 'R$ 99.999.999.999.999,99');
});

test('calcula o total estimado em centavos e respeita os limites NUMERIC', () => {
  assert.equal(calculatePatrimonioTotalCents(5, 80_000n), 400_000n);
  assert.equal(formatPatrimonioCents(calculatePatrimonioTotalCents(5, 80_000n)!), 'R$ 4.000,00');
  assert.equal(calculatePatrimonioTotalCents(1, PATRIMONIO_MAX_UNIT_CENTS), PATRIMONIO_MAX_UNIT_CENTS);
  assert.equal(calculatePatrimonioTotalCents(101, PATRIMONIO_MAX_UNIT_CENTS), null);
  assert.equal(formatPatrimonioCents(PATRIMONIO_MAX_TOTAL_CENTS), 'R$ 99.999.999.999.999,99');
});

test('quantidade aceita somente inteiro positivo compatível com PostgreSQL integer', () => {
  assert.equal(parsePatrimonioQuantity('1'), 1);
  assert.equal(parsePatrimonioQuantity('0'), null);
  assert.equal(parsePatrimonioQuantity('1.5'), null);
  assert.equal(parsePatrimonioQuantity('2147483648'), null);
});
