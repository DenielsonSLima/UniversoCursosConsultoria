import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appliedMigration, repairMigration] = await Promise.all([
  readFile(
    new URL('../migrations/20260727062448_fix_banese_claim_and_internal_failure_audit.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../migrations/20260827005000_fix_banese_reconciliation_error_summary_id_types.sql', import.meta.url),
    'utf8',
  ),
]);

const normalizesHeterogeneousIds = (source: string) => (
  /\('attempt:'\s*\|\|\s*attempt\.id::text\)\s+as id/i.test(source)
  && /\('run:'\s*\|\|\s*run\.id::text\)\s+as id/i.test(source)
);

test('contrato rejeita o UNION antigo entre bigint e uuid', () => {
  assert.equal(normalizesHeterogeneousIds(appliedMigration), false);
  assert.match(appliedMigration, /select\s+attempt\.id,[\s\S]*?union all[\s\S]*?select\s+run\.id,/i);
});

test('normaliza IDs de tentativa e execução antes do UNION ALL', () => {
  assert.equal(normalizesHeterogeneousIds(repairMigration), true);
  assert.match(
    repairMigration,
    /\('attempt:'\s*\|\|\s*attempt\.id::text\)\s+as id[\s\S]*?union all[\s\S]*?\('run:'\s*\|\|\s*run\.id::text\)\s+as id/i,
  );
  assert.doesNotMatch(
    repairMigration,
    /select\s+attempt\.id,[\s\S]*?union all[\s\S]*?select\s+run\.id,/i,
  );
});

test('preserva retorno, janela e chaves públicas do resumo', () => {
  assert.match(
    repairMigration,
    /create or replace function public\.get_banese_reconciliation_error_summary\(\)\s+returns jsonb/i,
  );
  for (const key of [
    'attemptsLastHour',
    'throttledLastHour',
    'authLastHour',
    'lastErrorAt',
    'lastErrors',
  ]) {
    assert.match(repairMigration, new RegExp(`'${key}'`));
  }
  assert.match(repairMigration, /created_at >= now\(\) - interval '1 hour'/i);
  assert.match(repairMigration, /order by source\.created_at desc\s+limit 5/i);
});

test('mantém guarda interna, search_path vazio e relações qualificadas', () => {
  assert.match(repairMigration, /language plpgsql\s+security definer\s+set search_path = ''/i);
  assert.match(repairMigration, /auth\.uid\(\) is null/i);
  assert.match(repairMigration, /not public\.is_gestor_global\(\)/i);
  assert.match(repairMigration, /not public\.gestor_has_module\('configuracoes'\)/i);
  assert.match(repairMigration, /from public\.payment_gateway_runtime_config runtime/i);
  assert.match(repairMigration, /from public\.banese_reconciliation_attempts attempt/i);
  assert.match(repairMigration, /from public\.banese_reconciliation_runs run/i);
  assert.doesNotMatch(repairMigration, /from\s+banese_reconciliation_(?:attempts|runs)\b/i);
});

test('revoga acesso público e preserva apenas os executores vigentes', () => {
  assert.match(
    repairMigration,
    /revoke all on function public\.get_banese_reconciliation_error_summary\(\)\s+from public, anon;/i,
  );
  assert.match(
    repairMigration,
    /grant execute on function public\.get_banese_reconciliation_error_summary\(\)\s+to authenticated, service_role;/i,
  );
  assert.doesNotMatch(
    repairMigration,
    /grant execute on function public\.get_banese_reconciliation_error_summary\(\)\s+to (?:public|anon)\b/i,
  );
});
