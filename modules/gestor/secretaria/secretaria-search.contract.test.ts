import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { matchesSecretariaSearch } from './secretaria-search.ts';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260730034051_make_secretaria_searches_accent_insensitive.sql',
);

test('busca local da Secretaria ignora acentos, caixa e máscara documental', () => {
  assert.equal(matchesSecretariaSearch('debora', ['DÉBORA FRANCINNY']), true);
  assert.equal(matchesSecretariaSearch('sao francisco', ['São Francisco/SE']), true);
  assert.equal(matchesSecretariaSearch('10523687516', ['105.236.875-16']), true);
  assert.equal(matchesSecretariaSearch('joao', ['Maria Gonçalves']), false);
});

test('RPC geral preserva autorização e isolamento por polo', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const generalSearch = sql.slice(
    sql.indexOf('create or replace function public.search_secretaria_students_secure'),
    sql.indexOf('-- Mantém contrato, RBAC, limite e escopo'),
  );

  assert.match(generalSearch, /extensions\.unaccent/);
  assert.match(generalSearch, /public\.gestor_has_tab\('secretaria', 'alunos'\)/);
  assert.match(generalSearch, /public\.can_manage_secretaria_document\(p_documento, p_polo_id\)/);
  assert.match(generalSearch, /or enrollment\.id is not null/);
  assert.doesNotMatch(generalSearch, /or student\.polo_id is null/);
});

test('migration cobre buscas financeiras e histórico paginado da Secretaria', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /create extension if not exists unaccent with schema extensions;/);
  assert.match(sql, /search_secretaria_finance_students_secure/);
  assert.match(sql, /search_secretaria_emissions_secure/);
  assert.match(sql, /document_row\.polo_id = p_polo_id/);
  assert.match(sql, /public\.gestor_has_tab\('secretaria', 'historico-emissoes'\)/);
});
