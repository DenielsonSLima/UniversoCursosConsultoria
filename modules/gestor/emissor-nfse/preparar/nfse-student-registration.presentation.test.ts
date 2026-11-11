import assert from 'node:assert/strict';
import test from 'node:test';
import { formatNfseStudentCpf, formatNfseStudentLocation } from './nfse-student-registration.presentation';

test('CPF formatting preserves leading zeros and never invents missing digits', () => {
  assert.equal(formatNfseStudentCpf('00100200300'), 'CPF 001.002.003-00');
  assert.equal(formatNfseStudentCpf(' 001.002.003-00 '), 'CPF 001.002.003-00');
  for (const value of [undefined, null, '', '   ']) assert.equal(formatNfseStudentCpf(value), 'CPF não informado');
  for (const value of ['123', '00000000000000', 'cpf00100200300', '001.***.003-00']) {
    assert.equal(formatNfseStudentCpf(value), 'CPF inválido');
  }
});

test('city and UF come from registration without a pole or inferred default', () => {
  assert.equal(formatNfseStudentLocation(' Cidade sintética ', ' se '), 'Cidade sintética / SE');
  assert.equal(formatNfseStudentLocation(null, 'SE'), 'Cidade não informada / SE');
  assert.equal(formatNfseStudentLocation('Cidade sintética', null), 'Cidade sintética / UF não informada');
  assert.equal(formatNfseStudentLocation(undefined, ''), 'Cidade/UF não informadas');
});
