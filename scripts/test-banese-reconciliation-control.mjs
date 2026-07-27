import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260727044535_banese_reconciliation_control_center.sql',
  import.meta.url,
);
const profileExpansionMigrationPath = new URL(
  '../supabase/migrations/20260727051725_expand_banese_reconciliation_profiles_and_runs_history.sql',
  import.meta.url,
);
const historyHardeningMigrationPath = new URL(
  '../supabase/migrations/20260727052716_harden_banese_reconciliation_history_windows.sql',
  import.meta.url,
);
const healthGuardMigrationPath = new URL(
  '../supabase/migrations/20260727053253_finalize_banese_reconciliation_health_guards.sql',
  import.meta.url,
);
const financialCycleMigrationPath = new URL(
  '../supabase/migrations/20260727045711_use_configured_installments_in_financial_cycles.sql',
  import.meta.url,
);
const workerPath = new URL(
  '../supabase/functions/banese-reconciliation-worker/index.ts',
  import.meta.url,
);
const eadModalPath = new URL(
  '../modules/ead/components/EadPaymentModal.tsx',
  import.meta.url,
);

const [migration, profileExpansionMigration, historyHardeningMigration, healthGuardMigration, financialCycleMigration, worker, eadModal] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(profileExpansionMigrationPath, 'utf8'),
  readFile(historyHardeningMigrationPath, 'utf8'),
  readFile(healthGuardMigrationPath, 'utf8'),
  readFile(financialCycleMigrationPath, 'utf8'),
  readFile(workerPath, 'utf8'),
  readFile(eadModalPath, 'utf8'),
]);

test('cadastra oito perfis conservadores e mantém quatro avançados bloqueados', () => {
  for (const [id, rate] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 8], [8, 10]]) {
    assert.match(profileExpansionMigration, new RegExp(`\\(${id}, '[^']+', ${rate}, ${rate * 2}, 'CONSERVATIVE', null, true`));
  }
  for (const [id, rate] of [[9, 30], [10, 60], [11, 90], [12, 150]]) {
    assert.match(profileExpansionMigration, new RegExp(`\\(${id}, '[^']+', ${rate}, ${rate * 2}, 'EXPERIMENTAL', [0-9]+, false`));
  }
  assert.match(profileExpansionMigration, /profile\.selectable[\s\S]+profile\.id <= 8/);
  assert.match(profileExpansionMigration, /least\(v_config\.selected_profile_id, 8\)/);
  assert.match(profileExpansionMigration, /get_banese_reconciliation_runs_page/);
  assert.match(historyHardeningMigration, /generate_series\(/);
  assert.match(historyHardeningMigration, /interval '10 minutes'/);
  assert.match(historyHardeningMigration, /'minutesPerPage', 60/);
  assert.match(historyHardeningMigration, /get_banese_reconciliation_error_summary/);
  assert.match(historyHardeningMigration, /set sicredi_reference_percent = null/);
  assert.match(historyHardeningMigration, /Falha isolada: perfil mantido e contagem de estabilidade reiniciada/);
  assert.match(healthGuardMigration, /v_status = 'SUCCESS'/);
  assert.match(healthGuardMigration, /v_checked > 0/);
  assert.match(healthGuardMigration, /Execução sem resultado válido/);
  assert.match(healthGuardMigration, /created_at >= now\(\) - interval '1 hour'/);
});

test('agenda um único ciclo por minuto e desativa a reserva legada', () => {
  assert.match(migration, /'banese-reconciliation-every-minute',\s+'\* \* \* \* \*'/);
  assert.match(migration, /select null::uuid\s+where false/);
  assert.match(migration, /claim_banese_reconciliation_batch_v2/);
});

test('worker consulta títulos existentes sem importar ou sincronizar parcelas futuras', () => {
  assert.doesNotMatch(worker, /syncRouteAwareFutureInstallments/);
  assert.doesNotMatch(worker, /futureSyncQueue|futureRecovered|projectionRetried/);
  assert.match(worker, /queryBaneseBoleto/);
  assert.match(worker, /record_banese_reconciliation_attempt/);
  assert.match(worker, /if \(throttled\) break/);
});

test('ciclo técnico usa a quantidade configurada e não fixa doze parcelas', () => {
  assert.match(financialCycleMigration, /v_parcelas_por_ciclo := v_turma\.qtd_parcelas/);
  assert.match(financialCycleMigration, /FOR v_numero IN 1\.\.v_parcelas_por_ciclo/);
  assert.doesNotMatch(
    financialCycleMigration,
    /v_parcelas_por_ciclo\s+CONSTANT\s+INTEGER\s*:=\s*12/,
  );
  assert.match(financialCycleMigration, /v_pagas_ciclo <> v_total_ciclo/);
  assert.match(financialCycleMigration, /v_numeros_distintos <> v_total_ciclo/);
  assert.match(financialCycleMigration, /v_primeiro_numero <> 1/);
  assert.match(financialCycleMigration, /v_ultimo_numero <> v_total_ciclo/);
});

test('OAuth é compartilhado por ambiente e não é persistido em logs operacionais', () => {
  assert.match(worker, /tokenCache = new Map<Environment, CachedToken>/);
  assert.match(worker, /tokenRequests = new Map<Environment, Promise<BaneseAccessToken>>/);
  assert.match(worker, /oauthReused/);
  assert.doesNotMatch(worker, /console\.(?:log|error)\([^)]*accessToken/);
  assert.doesNotMatch(worker, /gateway_last_error:\s*(?:message|safeError)/);
});

test('aviso EAD orienta Pix e boleto sem botão Já paguei', () => {
  assert.match(eadModal, /Aguardando confirmação do Banese/);
  assert.match(eadModal, /até 20 minutos/);
  assert.match(eadModal, /48 horas úteis/);
  assert.doesNotMatch(eadModal, /Já paguei/i);
});
