import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPersonDisplayName,
  getPersonLegalName,
  getPersonSocialName,
  hasDistinctSocialName,
} from './personDisplayName.ts';

test('usa o nome social preenchido como nome de exibição', () => {
  const person = { nome: 'NOME CIVIL', nomeSocial: 'NOME SOCIAL' };

  assert.equal(getPersonDisplayName(person), 'NOME SOCIAL');
  assert.equal(getPersonLegalName(person), 'NOME CIVIL');
  assert.equal(getPersonSocialName(person), 'NOME SOCIAL');
  assert.equal(hasDistinctSocialName(person), true);
});

test('usa o nome completo sem gravar cópia quando o nome social está vazio', () => {
  const person = { nomeCompleto: 'MARIA DA SILVA', nome_social: '   ' };

  assert.equal(getPersonDisplayName(person), 'MARIA DA SILVA');
  assert.equal(getPersonSocialName(person), '');
  assert.equal(hasDistinctSocialName(person), false);
});

test('não trata uma cópia do nome civil como nome social distinto', () => {
  const person = { nome: 'João José', nomeSocial: 'JOAO JOSE' };

  assert.equal(hasDistinctSocialName(person), false);
});
