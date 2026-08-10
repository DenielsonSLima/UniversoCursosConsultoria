import assert from 'node:assert/strict';
import test from 'node:test';
import { getPatrimonioErrorMessage, isPatrimonioConflictError } from './patrimonio.errors';

test('preserva mensagens de objetos PostgREST que não estendem Error', () => {
  const error = { code: '42501', message: 'Acesso não autorizado ao patrimônio deste polo.' };
  assert.equal(getPatrimonioErrorMessage(error, 'Falha genérica'), error.message);
});

test('detecta concorrência tanto pelo SQLSTATE quanto pela mensagem canônica', () => {
  assert.equal(isPatrimonioConflictError({ code: '40001', message: 'serialization failure' }), true);
  assert.equal(isPatrimonioConflictError({
    code: 'P0001',
    message: 'O patrimônio foi alterado por outro usuário. Atualize a lista e tente novamente.',
  }), true);
  assert.equal(isPatrimonioConflictError({ code: '42501', message: 'Acesso não autorizado.' }), false);
});
