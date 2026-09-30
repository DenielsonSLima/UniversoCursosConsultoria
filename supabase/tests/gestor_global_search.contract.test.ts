import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const source = readFileSync(resolve(
  root,
  'supabase/migrations/20260930011500_create_gestor_global_search.sql',
), 'utf8');
const typeFix = readFileSync(resolve(
  root,
  'supabase/migrations/20260930012500_fix_gestor_global_search_result_types.sql',
), 'utf8');
const signatureEnd = source.indexOf('RETURNS TABLE');
const signature = source.slice(0, signatureEnd);

test('RPC não aceita escopo de polo fornecido pelo cliente', () => {
  assert.match(signature, /p_search text/);
  assert.match(signature, /p_limit integer DEFAULT 12/);
  assert.doesNotMatch(signature, /p_polo|p_allowed|p_scope/);
  assert.match(source, /gestor_allowed_polo_ids\(\)/);
  assert.match(source, /gestor_has_module\('parceiros'\)/);
  assert.match(source, /is_partner_in_gestor_read_scope\(partner\.polo_id, partner\.polo_ids\)/);
});

test('turmas seguem guardas acadêmicas e não duplicam contagem do aluno', () => {
  assert.match(source, /gestor_can_read_academic_roster\(turma\.id\)/);
  assert.match(source, /gestor_can_read_diario_results\(turma\.id\)/);
  assert.match(source, /GROUP BY turma\.id, turma\.nome, turma\.codigo/);
  assert.match(source, /count\(\*\) OVER \(\) - 1/);
});

test('função é definer endurecida e executável somente pelos papéis previstos', () => {
  assert.match(source, /SECURITY DEFINER/);
  assert.match(source, /SET search_path = ''/);
  assert.match(source, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(source, /GRANT EXECUTE[\s\S]*TO authenticated, service_role/);
  assert.match(source, /ERRCODE = '42501'/);
  assert.match(typeFix, /matched\.scoped_polo_state::text AS polo_state/);
  assert.match(typeFix, /IF v_rewritten = v_definition THEN/);
  assert.match(typeFix, /FROM PUBLIC, anon, authenticated, service_role/);
});
