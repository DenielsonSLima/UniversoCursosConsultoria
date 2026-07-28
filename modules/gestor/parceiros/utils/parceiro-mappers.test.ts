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
