import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidBaneseEdi7Code,
  normalizeBaneseEdi7Code,
} from './integracao-bancaria.validation.ts';

test('normaliza o código EDI 7 para no máximo seis dígitos', () => {
  assert.equal(normalizeBaneseEdi7Code('12.34-5678'), '123456');
  assert.equal(normalizeBaneseEdi7Code('ABC'), '');
});

test('aceita somente código EDI 7 com exatamente seis dígitos', () => {
  assert.equal(isValidBaneseEdi7Code('123456'), true);
  assert.equal(isValidBaneseEdi7Code('12345'), false);
  assert.equal(isValidBaneseEdi7Code(''), false);
});

