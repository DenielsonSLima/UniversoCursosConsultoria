import test from 'node:test';
import assert from 'node:assert/strict';
import { toCamel, toSnake } from './parceiro-mappers.ts';

test('mapeia categoria e tipo de parceria sem perder os textos legados', () => {
  const parceiro = toCamel({
    id: 'partner-1',
    tipo: 'PJ',
    nome: 'Empresa Teste',
    tipo_pj: 'CLASSIFICAÇÃO ANTIGA',
    tipo_convenio: 'FORNECEDOR',
    categoria_id: 'category-1',
    tipo_parceria_id: 'partnership-type-1',
    categoria: { id: 'category-1', nome: 'Supermercado', status: 'ativo' },
    tipo_parceria: { id: 'partnership-type-1', nome: 'FORNECEDOR', status: 'ativo' },
  });

  assert.equal(parceiro.categoriaId, 'category-1');
  assert.equal(parceiro.categoriaNome, 'Supermercado');
  assert.equal(parceiro.tipoParceriaId, 'partnership-type-1');
  assert.equal(parceiro.tipoParceriaNome, 'FORNECEDOR');
  assert.equal(parceiro.classificacaoLegada, 'CLASSIFICAÇÃO ANTIGA');
});

test('mantém o tipo de convênio antigo como fallback para cadastros ainda não vinculados', () => {
  const parceiro = toCamel({
    id: 'partner-legacy',
    tipo: 'PJ',
    nome: 'Empresa Legada',
    tipo_pj: 'FACULDADE PARCEIRA / AFILIADO',
    tipo_convenio: 'FACULDADE PARCEIRA / AFILIADO',
  });

  assert.equal(parceiro.categoriaNome, null);
  assert.equal(parceiro.tipoParceriaNome, 'FACULDADE PARCEIRA / AFILIADO');
  assert.equal(parceiro.tipoConvenio, 'FACULDADE PARCEIRA / AFILIADO');
});

test('grava os novos vínculos e os textos compatíveis no payload do parceiro', () => {
  const payload = toSnake({
    tipo: 'PJ',
    nome: 'Empresa Nova',
    categoriaId: 'category-1',
    tipoParceriaId: 'partnership-type-1',
    tipoPj: 'Supermercado',
    tipoConvenio: 'FORNECEDOR',
  });

  assert.equal(payload.categoria_id, 'category-1');
  assert.equal(payload.tipo_parceria_id, 'partnership-type-1');
  assert.equal(payload.tipo_pj, 'Supermercado');
  assert.equal(payload.tipo_convenio, 'FORNECEDOR');
});

test('mapeia o ciclo de acesso sem apagá-lo em uma atualização sem esses campos', () => {
  const parceiro = toCamel({
    id: 'student-1',
    tipo: 'Aluno',
    nome: 'Aluno Teste',
    acesso_status: 'erro',
    acesso_erro: 'Falha operacional segura',
    convite_enviado_em: '2026-08-03T10:00:00.000Z',
    acesso_ativado_em: null,
  });
  const unrelatedUpdate = toSnake({ tipo: 'Aluno', nome: 'Aluno Teste' });

  assert.equal(parceiro.acessoStatus, 'erro');
  assert.equal(parceiro.acessoErro, 'Falha operacional segura');
  assert.equal(parceiro.conviteEnviadoEm, '2026-08-03T10:00:00.000Z');
  assert.equal('acesso_status' in unrelatedUpdate, false);
  assert.equal('acesso_erro' in unrelatedUpdate, false);
  assert.equal('troca_senha_obrigatoria' in unrelatedUpdate, false);
});
