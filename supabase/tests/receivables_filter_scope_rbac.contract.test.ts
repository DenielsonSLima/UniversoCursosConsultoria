import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260831134030_harden_receivables_filter_scope_rbac.sql',
    import.meta.url,
  ),
  'utf8',
);

test('helper exige identidade, módulo Financeiro e aba Receber', () => {
  assert.match(migration, /auth\.role\(\)\s*=\s*'service_role'/i);
  assert.match(migration, /auth\.uid\(\)\s+IS\s+NULL/i);
  assert.match(migration, /gestor_has_module\('financeiro'\)/i);
  assert.match(migration, /gestor_has_financeiro_tab\('receber'\)/i);
  assert.match(migration, /ERRCODE\s*=\s*'42501'/i);
});

test('helper preserva visão global e restringe polo específico', () => {
  assert.match(
    migration,
    /p_polo_id\s+IS\s+NULL\s+AND\s+NOT\s+public\.is_gestor_global\(\)/i,
  );
  assert.match(
    migration,
    /p_polo_id\s+IS\s+NOT\s+NULL[\s\S]*?NOT\s+public\.is_gestor_for_polo\(p_polo_id\)/i,
  );
});

test('helper privilegiado fica interno e com search_path vazio', () => {
  assert.match(migration, /SECURITY\s+DEFINER/i);
  assert.match(migration, /SET\s+search_path\s*=\s*''/i);
  assert.match(
    migration,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.assert_receivables_filter_scope\(uuid\)[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated,\s*service_role/i,
  );
  assert.doesNotMatch(migration, /GRANT\s+EXECUTE/i);
});
