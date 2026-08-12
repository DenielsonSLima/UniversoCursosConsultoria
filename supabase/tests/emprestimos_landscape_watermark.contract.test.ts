import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260811122418_fix_loan_export_landscape_watermark.sql'),
  'utf8',
);

test('snapshot de empréstimos devolve apenas a marca configurada para paisagem', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.preparar_relatorio_emprestimos_financeiros_secure/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path TO ''/);
  assert.match(migration, /concat\('watermark_landscape_', p_polo_id\)/);
  assert.match(migration, /'landscape_watermark_url', nullif\(v_landscape ->> 'url', ''\)/);
  assert.match(migration, /'landscape_watermark_opacity'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.preparar_relatorio_emprestimos_financeiros_secure/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.preparar_relatorio_emprestimos_financeiros_secure/);
  assert.doesNotMatch(migration, /landscape_watermark_url',\s*coalesce\([^)]*polo\.watermark_url/i);
});
