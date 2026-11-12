import assert from 'node:assert/strict';
import test from 'node:test';
import { recipientDocumentLabel, recipientLocationLabel } from './nfse-recipient.presentation';
test('recipient documents are readable without inventing missing identity', () => {
  assert.equal(recipientDocumentLabel('00100200300'), 'CPF 001.002.003-00');
  assert.equal(recipientDocumentLabel('00100203000100'), 'CNPJ 00.100.203/0001-00');
  assert.equal(recipientDocumentLabel(null), 'CPF/CNPJ não informado');
  assert.equal(recipientDocumentLabel('123'), 'CPF/CNPJ não informado');
});
test('location never substitutes issuer location or guesses a state', () => {
  assert.equal(recipientLocationLabel('Canhoba', 'SE'), 'Canhoba / SE');
  assert.equal(recipientLocationLabel(null, 'SE'), 'Cidade/UF não informada');
  assert.equal(recipientLocationLabel('Cidade sintética', null), 'Cidade sintética · UF não informada');
});
