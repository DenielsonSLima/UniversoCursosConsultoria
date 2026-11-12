import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { nfseQueueValidationMessage } from './nfse-queue-validation.ts';

test('academic reference error explains the missing source without disclosing the receipt ID', () => {
  const message = nfseQueueValidationMessage('Recebimento 00000000-0000-4000-8000-000000000001: informe a parcela ou o tipo de taxa no lançamento financeiro.');
  assert.match(message, /identificação de parcela ou tipo de taxa no Financeiro/);
  assert.doesNotMatch(message, /00000000/);
});

test('unknown database text and malformed messages never leak into the validation message', () => {
  for (const message of [null, {}, 'CPF reservado', 'Recebimento segredo: informe a parcela ou o tipo de taxa no lançamento financeiro.']) {
    assert.equal(nfseQueueValidationMessage(message), 'Revise o mês, os alunos e o modelo antes de preparar as notas.');
  }
});
