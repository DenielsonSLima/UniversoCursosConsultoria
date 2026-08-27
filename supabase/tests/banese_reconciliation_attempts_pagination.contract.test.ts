import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../migrations/20260827093000_paginate_banese_reconciliation_attempts.sql', import.meta.url),
  'utf8',
);

test('RPC get_banese_reconciliation_attempts_page suporta paginação e contexto', () => {
  assert.match(migration, /create or replace function public\.get_banese_reconciliation_attempts_page/i);
  assert.match(migration, /p_context text default 'queries'/);
  assert.match(migration, /p_page integer default 1/);
  assert.match(migration, /p_page_size integer default 20/);
  assert.match(migration, /'pageSize', v_page_size/);
  assert.match(migration, /'totalCount', v_total_count/);
  assert.match(migration, /'totalPages', v_total_pages/);
  assert.match(migration, /limit v_page_size/);
  assert.match(migration, /offset v_offset/);
});

test('RPC aplica controle de acesso e regras financeiras mínimas', () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /auth\.uid\(\) is null/i);
  assert.match(migration, /public\.is_gestor_global\(\)/i);
  assert.match(migration, /public\.gestor_has_module\('configuracoes'\)/i);
  assert.match(migration, /public\.gestor_has_module\('financeiro'\)/i);
  assert.match(migration, /public\.gestor_has_financeiro_tab\('receber'\)/i);
  assert.match(migration, /case when v_can_receivable_details then partner\.nome end/);
  assert.match(migration, /revoke all on function public\.get_banese_reconciliation_attempts_page/i);
  assert.match(migration, /grant execute on function public\.get_banese_reconciliation_attempts_page/i);
});

test('dashboard leve não trafega listas completas de tentativas por padrão', () => {
  assert.match(migration, /create or replace function public\.get_banese_reconciliation_dashboard/i);
  assert.match(migration, /'lastAttempts', '\[\]'::jsonb/);
  assert.match(migration, /'lastSettlements', '\[\]'::jsonb/);
  assert.match(migration, /'lastErrorAttempts', '\[\]'::jsonb/);
});
