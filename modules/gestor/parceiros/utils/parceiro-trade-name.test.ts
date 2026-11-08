import test from 'node:test';
import assert from 'node:assert/strict';
import { toCamel, toSnake } from './parceiro-mappers.ts';

test('cadastro PJ conserva razão social e fantasia independentemente no round-trip', () => {
  const payload = toSnake({ tipo: 'PJ', nome: 'EMPRESA TESTE LTDA', nomeFantasia: '  MARCA TESTE  ' });
  assert.equal(payload.nome, 'EMPRESA TESTE LTDA');
  assert.equal(payload.nome_fantasia, 'MARCA TESTE');
  const parceiro = toCamel({ id: 'pj', ...payload });
  assert.equal(parceiro.razaoSocial, 'EMPRESA TESTE LTDA');
  assert.equal(parceiro.nomeFantasia, 'MARCA TESTE');
  assert.equal(toSnake(parceiro).nome_fantasia, 'MARCA TESTE');
});

test('edição pode limpar fantasia sem alterar razão social', () => {
  const parceiro = toCamel({ tipo: 'PJ', nome: 'EMPRESA TESTE LTDA', nome_fantasia: 'MARCA' });
  assert.equal(toSnake({ ...parceiro, nomeFantasia: ' ' }).nome_fantasia, null);
  assert.equal(toSnake({ ...parceiro, nomeFantasia: 'NOVA MARCA' }).nome, 'EMPRESA TESTE LTDA');
});

test('cadastro legado não inventa fantasia nem apaga a coluna quando não informada', () => {
  const parceiro = toCamel({ tipo: 'PJ', nome: 'EMPRESA LEGADA' });
  assert.equal(parceiro.nomeFantasia, null);
  assert.equal(Object.hasOwn(toSnake({ tipo: 'PJ', nome: 'EMPRESA LEGADA' }), 'nome_fantasia'), false);
});

test('nome fantasia não é gravado nos demais tipos de parceiro', () => {
  for (const tipo of ['Aluno', 'Professor', 'PF']) {
    const payload = toSnake({ tipo, nome: 'PESSOA TESTE', nomeFantasia: 'MARCA' });
    assert.equal(Object.hasOwn(payload, 'nome_fantasia'), false);
  }
});
