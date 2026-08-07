import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { textMatchesSearch } from '../../../lib/search.ts';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260730034039_financeiro_accent_insensitive_search.sql',
);

test('busca local do Financeiro ignora acentos, caixa e mascara documental', () => {
  assert.equal(
    textMatchesSearch('debora', ['DÉBORA FRANCINNY', '105.236.875-16']),
    true,
  );
  assert.equal(
    textMatchesSearch('sao francisco', ['AMPARO DE SÃO FRANCISCO/SE']),
    true,
  );
  assert.equal(
    textMatchesSearch('10523687516', ['105.236.875-16']),
    true,
  );
  assert.equal(
    textMatchesSearch('debora', ['Mariana Souza', '000.000.000-00']),
    false,
  );
});

test('migration cobre os contratos remotos de busca financeira sem aplicar alteracao remota', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;/,
  );
  assert.match(sql, /extensions\.unaccent\(coalesce\(p_value, ''\)\)/);
  assert.match(sql, /pg_get_functiondef\(v_function_oid\)/);
  assert.match(sql, /IF v_rewritten = v_definition THEN/);

  const signatures = [
    'search_financeiro_aluno_receivables_secure(text,uuid,integer)',
    'get_receivables_modality_page(text,uuid,text,date,date,text,text,text,integer,integer)',
    'get_receivables_modality_groups_page(text,uuid,text,date,date,text,text,integer,integer)',
    'get_receivables_modality_summary_v2(text,uuid,text,date,date)',
    'get_despesas_summary(text,uuid,uuid,text,date,date,text,uuid)',
    'get_despesas_group_summary_secure(text,uuid,uuid,text,date,date,text,uuid)',
    'get_transferencias_contas(uuid,text,uuid,uuid,date,date,boolean)',
    'get_outros_creditos_summary(uuid,text,date,date,uuid)',
  ];

  for (const signature of signatures) {
    assert.ok(sql.includes(`public.${signature}`), `assinatura ausente: ${signature}`);
  }
});

test('migration mantem indice trigram no caminho principal de alunos', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /parceiros_alunos_nome_unaccent_trgm_idx/);
  assert.match(sql, /parceiros_alunos_cpf_unaccent_trgm_idx/);
  assert.match(sql, /contas_receber_descricao_abertos_unaccent_trgm_idx/);
  assert.match(sql, /extensions\.gin_trgm_ops/);
});
